#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mirror_sync.py — 服务器目录 → 本地副本 单向镜像同步
仅使用 Python 3 标准库，不依赖任何框架、服务或第三方工具。

前提假设
--------
1. 「服务器目录」以*本机可读路径*提供：网络挂载、共享盘，或由外部任意工具
   预先拉取到本机的目录。本程序不内置、也不假定任何传输协议/服务，只做
   「读源 → 比对 → 镜像本地」这一步。
2. 同步方向为单向：服务器是唯一数据源，本地是可丢弃的镜像。程序只读源、
   绝不写源；本地任何人工改动（新增/修改/删除）下一轮都会被纠正。
3. 本地目录由本程序独占管理；日志、回收站都放在本地目录*之外*，避免
   自己触发下一轮同步。

用法
----
  python mirror_sync.py --server-dir ./server-source --local-dir ./local-mirror
  python mirror_sync.py --config sync.json --dry-run
  python mirror_sync.py --config sync.json --verify
  python mirror_sync.py --help
"""

import argparse
import fnmatch
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import time

# 全部默认值均为占位/可替换值；最小必要配置只有 server_dir 与 local_dir 两项。
DEFAULTS = {
    # 目录
    "server_dir": "./server-source",       # 源：服务器目录在本机的可读路径
    "local_dir": "./local-mirror",         # 目标：本地副本目录
    # 文件范围（glob，匹配相对路径或其任一路径段）
    "include": ["*"],
    "exclude": [".git", ".DS_Store", "*.tmp", "*.part", "~*"],
    # 同步时机：0 = 单次执行（由 cron / 计划任务驱动）；>0 = 内置循环秒数
    "interval_seconds": 0,
    # 删除策略：trash（移入回收站）| delete（直接删）| keep（不删）
    "delete_policy": "trash",
    "trash_dir": "",                       # 空 = <local_dir>.trash
    "trash_retention_days": 30,
    # 失败重试（每个文件的复制/删除，退避间隔 = delay * 第几次）
    "retries": 3,
    "retry_delay_seconds": 2,
    # 日志
    "log_file": "",                        # 空 = <local_dir>.sync.log
    "log_level": "INFO",
    # 误删保护
    "min_source_files": 1,                 # 源匹配文件数低于此值 → 判定源异常，整轮中止
    "max_delete_count": 50,                # 单轮删除数量上限
    "max_delete_ratio": 0.5,               # 单轮删除占本地文件数比例上限
    "allow_bulk_delete": False,            # 确认无误后才置 true，放行超阈值删除
    "dry_run": False,
}


def setup_logging(cfg):
    Path(cfg["log_file"]).parent.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("mirror")
    log.handlers.clear()
    log.setLevel(getattr(logging, str(cfg["log_level"]).upper(), logging.INFO))
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    for handler in (logging.StreamHandler(sys.stdout),
                    logging.FileHandler(cfg["log_file"], encoding="utf-8")):
        handler.setFormatter(fmt)
        log.addHandler(handler)
    return log


def _excluded(rel, patterns):
    parts = rel.split("/")
    return any(fnmatch.fnmatch(candidate, pat)
               for pat in patterns for candidate in [rel, *parts])


def _selected(rel, cfg):
    return (any(fnmatch.fnmatch(rel, pat) for pat in cfg["include"])
            and not _excluded(rel, cfg["exclude"]))


def scan(root, cfg):
    """返回 {相对路径: 绝对路径}，只收普通文件，跳过符号链接。"""
    if not root.is_dir():
        raise RuntimeError("目录不可访问或不存在: %s" % root)
    found = {}
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        dirnames[:] = [d for d in dirnames
                       if not (base / d).is_symlink()
                       and not _excluded((base / d).relative_to(root).as_posix(),
                                         cfg["exclude"])]
        for name in filenames:
            path = base / name
            if path.is_symlink() or not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            if _selected(rel, cfg):
                found[rel] = path
    return found


def same(a, b):
    try:
        sa, sb = a.stat(), b.stat()
        return sa.st_size == sb.st_size and sa.st_mtime_ns == sb.st_mtime_ns
    except OSError:
        return False


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def retry(op, cfg, log, what):
    attempts = max(1, int(cfg["retries"]))
    for attempt in range(1, attempts + 1):
        try:
            return op()
        except OSError as exc:
            if attempt == attempts:
                raise
            delay = float(cfg["retry_delay_seconds"]) * attempt
            log.warning("%s 失败(%d/%d): %s；%ss 后重试",
                        what, attempt, attempts, exc, delay)
            time.sleep(delay)


def copy_file(src, dst, cfg, log):
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".part")

    def op():
        shutil.copy2(src, tmp)   # 保留 mtime，下一轮不会误判为「修改」
        os.replace(tmp, dst)     # 原子替换，避免中断留下半截文件

    retry(op, cfg, log, "复制 %s" % src)


def remove_file(path, rel, cfg, log, stamp):
    policy = cfg["delete_policy"]
    if policy == "keep":
        log.info("保留   %s（delete_policy=keep）", rel)
        return
    if policy == "trash":
        dest = Path(cfg["trash_dir"]) / stamp / rel

        def op():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(dest))

        retry(op, cfg, log, "移入回收站 %s" % rel)
        log.info("回收站 %s -> %s", rel, dest)
    elif policy == "delete":
        retry(lambda: path.unlink(), cfg, log, "删除 %s" % rel)
        log.info("删除   %s", rel)
    else:
        raise RuntimeError("未知 delete_policy: %s" % policy)


def prune_empty_dirs(root):
    dirs = sorted((p for p in root.rglob("*") if p.is_dir()),
                  key=lambda p: len(p.parts), reverse=True)
    for d in dirs:
        try:
            d.rmdir()
        except OSError:
            pass


def cleanup_trash(cfg, log):
    root = Path(cfg["trash_dir"])
    if not root.is_dir():
        return
    cutoff = time.time() - float(cfg["trash_retention_days"]) * 86400
    for d in root.iterdir():
        if d.is_dir() and d.stat().st_mtime < cutoff:
            shutil.rmtree(d, ignore_errors=True)
            log.info("清理过期回收站 %s", d)


def run_once(cfg, log, dry):
    src = Path(cfg["server_dir"]).resolve()
    dst = Path(cfg["local_dir"]).resolve()
    if src == dst or src in dst.parents or dst in src.parents:
        raise RuntimeError("源与本地目录不能相同或互相嵌套")

    # 先扫描源：源不可读/为空时直接抛错，此时尚未对本地做任何写操作
    src_files = scan(src, cfg)
    if len(src_files) < int(cfg["min_source_files"]):
        raise RuntimeError(
            "源目录仅 %d 个匹配文件（下限 %s），疑似挂载失败或目录为空；"
            "本轮已中止，本地文件未改动" % (len(src_files), cfg["min_source_files"]))

    dst_files = scan(dst, cfg) if dst.is_dir() else {}
    added = [r for r in src_files if r not in dst_files]
    updated = [r for r in src_files if r in dst_files
               and not same(src_files[r], dst_files[r])]
    to_delete = [r for r in dst_files if r not in src_files]
    unchanged = len(src_files) - len(added) - len(updated)

    # 误删保护：必须在任何写操作之前判定
    if to_delete and cfg["delete_policy"] != "keep":
        ratio = len(to_delete) / max(1, len(dst_files))
        over = (len(to_delete) > int(cfg["max_delete_count"])
                or ratio > float(cfg["max_delete_ratio"]))
        if over and not cfg["allow_bulk_delete"]:
            raise RuntimeError(
                "本轮拟删除 %d/%d 个本地文件，超过阈值（%d 个 / %.0f%%）；"
                "已中止全部操作。确认源目录正常后设 allow_bulk_delete=true 重跑"
                % (len(to_delete), len(dst_files), cfg["max_delete_count"],
                   float(cfg["max_delete_ratio"]) * 100))
        if over:
            log.warning("allow_bulk_delete=true，放行批量删除 %d 个文件", len(to_delete))

    stats = {"added": len(added), "updated": len(updated),
             "deleted": len(to_delete), "unchanged": unchanged, "failed": 0}
    if dry:
        log.info("[dry-run] 新增%d 更新%d 删除%d 未变%d",
                 stats["added"], stats["updated"], stats["deleted"], unchanged)
        for r in added:
            log.info("[dry-run] + %s", r)
        for r in updated:
            log.info("[dry-run] ~ %s", r)
        for r in ([] if cfg["delete_policy"] == "keep" else to_delete):
            log.info("[dry-run] - %s", r)
        return stats

    dst.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    started = time.time()

    for rel in added + updated:
        try:
            copy_file(src_files[rel], dst / rel, cfg, log)
            log.info("%s %s", "新增" if rel in added else "更新", rel)
        except OSError as exc:
            stats["failed"] += 1
            log.error("失败   %s: %s", rel, exc)
    for rel in to_delete:
        try:
            remove_file(dst_files[rel], rel, cfg, log, stamp)
        except OSError as exc:
            stats["failed"] += 1
            log.error("失败   %s: %s", rel, exc)

    prune_empty_dirs(dst)
    cleanup_trash(cfg, log)
    log.info("完成: +%d ~%d -%d =%d 失败%d 耗时%.2fs",
             stats["added"], stats["updated"], stats["deleted"], unchanged,
             stats["failed"], time.time() - started)
    return stats


def verify(cfg, log):
    """内容级校验：集合一致 + SHA-256 一致；退出码 0=一致，1=有差异。"""
    src = Path(cfg["server_dir"]).resolve()
    dst = Path(cfg["local_dir"]).resolve()
    a, b = scan(src, cfg), scan(dst, cfg) if dst.is_dir() else {}
    missing = sorted(r for r in a if r not in b)
    extra = sorted(r for r in b if r not in a)
    changed = sorted(r for r in a if r in b and digest(a[r]) != digest(b[r]))
    log.info("校验: 源%d 本地%d | 缺失%d 多余%d 内容不同%d",
             len(a), len(b), len(missing), len(extra), len(changed))
    for label, items in (("缺失", missing), ("多余", extra), ("内容不同", changed)):
        for r in items:
            log.info("校验 - %s %s", label, r)
    ok = not (missing or extra or changed)
    log.info("校验结果: %s", "一致" if ok else "不一致")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="服务器目录 → 本地副本 单向镜像同步")
    ap.add_argument("--config", help="JSON 配置文件，覆盖 DEFAULTS 中的项")
    ap.add_argument("--server-dir", help="覆盖 server_dir")
    ap.add_argument("--local-dir", help="覆盖 local_dir")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不写任何文件")
    ap.add_argument("--verify", action="store_true", help="只做内容级校验，不同步")
    ap.add_argument("--once", action="store_true", help="强制单次，忽略 interval_seconds")
    args = ap.parse_args()

    cfg = dict(DEFAULTS)
    if args.config:
        cfg.update(json.loads(Path(args.config).read_text(encoding="utf-8")))
    if args.server_dir:
        cfg["server_dir"] = args.server_dir
    if args.local_dir:
        cfg["local_dir"] = args.local_dir
    if args.dry_run:
        cfg["dry_run"] = True
    if cfg["delete_policy"] not in ("trash", "delete", "keep"):
        ap.error("delete_policy 只能是 trash / delete / keep")

    dst = Path(cfg["local_dir"]).resolve()
    cfg["trash_dir"] = cfg["trash_dir"] or str(dst.parent / (dst.name + ".trash"))
    cfg["log_file"] = cfg["log_file"] or str(dst.parent / (dst.name + ".sync.log"))

    log = setup_logging(cfg)
    if args.verify:
        return verify(cfg, log)

    interval = 0 if args.once else int(cfg["interval_seconds"])
    dry = bool(cfg["dry_run"])
    while True:
        try:
            rc = 1 if run_once(cfg, log, dry)["failed"] else 0
        except Exception as exc:                 # 源异常/权限/冲突：整轮放弃，绝不误删
            log.error("本轮中止: %s", exc)
            rc = 1
        if interval <= 0:
            return rc
        log.info("等待 %ds 后下一轮", interval)
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
