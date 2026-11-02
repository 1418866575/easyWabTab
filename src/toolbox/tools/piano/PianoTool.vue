<script setup lang="ts">
/**
 * 在线钢琴：鼠标 / 触屏 / 电脑键盘弹奏，三种音色 + 延音踏板，内置曲目演示
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { freqOf, isBlack, KEYMAP, MAX_VOICES, NOTES, SONGS, VOICES, voiceParams, type VoiceName } from './pianoCore'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const audioOk = ref(false)
const voice = ref<VoiceName>('piano')
const sustain = ref(false)
const volume = ref(60)
const playingSong = ref('')
const active = ref<Record<string, boolean>>({})

let ctx: AudioContext | null = null
const voices: { note: string }[] = []
let songTimer: ReturnType<typeof setTimeout> | null = null

const whites = computed(() => NOTES.filter((n) => !isBlack(n)))
const blacks = computed(() => NOTES.filter((n) => isBlack(n)))
const volumeVal = computed(() => volume.value / 100)
const BLACK_W = 6.4

/** 黑键水平位置：紧跟其左侧白键的右边界，居中对齐 */
function blackLeft(note: string): string {
  const base: Record<string, string> = {
    'C#4': 'C4', 'D#4': 'D4', 'F#4': 'F4', 'G#4': 'G4', 'A#4': 'A4',
    'C#5': 'C5', 'D#5': 'D5', 'F#5': 'F5', 'G#5': 'G5', 'A#5': 'A5'
  }
  const idx = whites.value.indexOf(base[note] ?? '')
  if (idx < 0) return '0%'
  return `${((idx + 1) / whites.value.length) * 100 - BLACK_W / 2}%`
}

async function enableAudio() {
  if (audioOk.value) return
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    toast.error('当前浏览器不支持 Web Audio')
    return
  }
  ctx = ctx ?? new Ctor()
  if (ctx.state === 'suspended') await ctx.resume()
  audioOk.value = true
  play('C4')
}

function play(note: string) {
  if (!ctx || !audioOk.value || voices.length >= MAX_VOICES) return
  const freq = freqOf(note)
  if (!freq) return
  const p = voiceParams(voice.value)
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = p.wave
  osc.frequency.value = freq
  const peak = 0.32 * volumeVal.value
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(peak, now + p.attack)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * p.sustain), now + p.attack + p.decay)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  const dur = sustain.value ? p.decay + p.release + 1.2 : p.decay + p.release
  const stopAt = now + dur
  gain.gain.setTargetAtTime(0.0001, stopAt - p.release, p.release / 3)
  osc.stop(stopAt + p.release)
  voices.push({ note })
  if (voices.length > MAX_VOICES) voices.shift()
  active.value = { ...active.value, [note]: true }
  setTimeout(() => {
    active.value = { ...active.value, [note]: false }
  }, 160)
}

function stopSong() {
  if (songTimer) clearTimeout(songTimer)
  songTimer = null
  playingSong.value = ''
}

async function playSong(id: string) {
  if (!audioOk.value) {
    await enableAudio()
    if (!audioOk.value) return
  }
  stopSong()
  const song = SONGS.find((s) => s.id === id)
  if (!song) return
  playingSong.value = id
  const beat = 60 / song.bpm
  const scheduleNext = (i: number) => {
    if (playingSong.value !== id || i >= song.notes.length) {
      stopSong()
      return
    }
    const n = song.notes[i]
    play(n.note)
    songTimer = setTimeout(() => scheduleNext(i + 1), n.dur * beat * 1000)
  }
  scheduleNext(0)
}

function keyHandler(e: KeyboardEvent) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const note = KEYMAP[e.key.toLowerCase()]
  if (note) {
    e.preventDefault()
    play(note)
  }
}

onMounted(() => window.addEventListener('keydown', keyHandler))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyHandler)
  stopSong()
  if (ctx) void ctx.close()
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <button v-if="!audioOk" type="button" class="tu-btn" @click="enableAudio">启用声音</button>
      <template v-else>
        <select v-model="voice" class="tu-select">
          <option v-for="v in VOICES" :key="v.id" :value="v.id">{{ v.name }}</option>
        </select>
        <label class="tu-check" :class="{ 'is-on': sustain }">
          <input v-model="sustain" type="checkbox" /> 延音踏板
        </label>
        <label class="tu-label pn-inline">音量 {{ volume }}</label>
        <input v-model.number="volume" type="range" class="tu-range pn-range" min="0" max="100" />
        <span class="tu-spacer"></span>
        <button
          v-for="s in SONGS"
          :key="s.id"
          type="button"
          class="tu-btn ghost"
          @click="playingSong === s.id ? stopSong() : playSong(s.id)"
        >{{ playingSong === s.id ? '停止' : s.name }}</button>
      </template>
    </div>

    <div class="pn-stage">
      <div class="pn-keyboard">
        <button
          v-for="n in whites"
          :key="n"
          type="button"
          class="pn-white"
          :class="{ 'is-on': active[n] }"
          @pointerdown.prevent="play(n)"
        >
          <span class="pn-label">{{ n }}</span>
        </button>
        <button
          v-for="n in blacks"
          :key="n"
          type="button"
          class="pn-black"
          :class="{ 'is-on': active[n] }"
          :style="{ left: blackLeft(n) }"
          @pointerdown.prevent="play(n)"
        ></button>
      </div>
    </div>

    <p class="tu-hint">
      鼠标 / 触屏点击或用键盘弹奏（白键 A S D F G H J K L ;，黑键 W E T Y U O P）。
      浏览器要求用户手势后才能出声，首次点击「启用声音」即可。
    </p>
  </div>
</template>

<style scoped>
.pn-inline { margin-bottom: 0; }
.pn-range { width: 110px; }
.pn-stage { overflow-x: auto; }
.pn-keyboard { position: relative; display: flex; min-width: 640px; height: 200px; }
.pn-white {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 0 0 6px 6px;
  background: #ffffff;
  cursor: pointer;
  position: relative;
}
.pn-white.is-on { background: var(--color-primary-soft); }
.pn-black {
  position: absolute;
  top: 0;
  width: 6.4%;
  height: 60%;
  border-radius: 0 0 4px 4px;
  background: #23262f;
  border: 1px solid #10131a;
  cursor: pointer;
  z-index: 2;
}
.pn-black.is-on { background: var(--color-primary); }
.pn-label { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font-size: 10px; color: var(--color-text-muted); }
</style>
