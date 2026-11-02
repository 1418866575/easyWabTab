/**
 * 在线钢琴纯逻辑：音名频率表、键盘映射与内置曲目（合成在组件里用 WebAudio 实现）
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** C4（MIDI 60）~ B5（MIDI 83）共 24 个半音 */
export const NOTES: string[] = Array.from({ length: 24 }, (_, i) => {
  const midi = 60 + i
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
})

export function freqOf(note: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(note)
  if (!m) return 0
  const idx = NOTE_NAMES.indexOf(m[1])
  if (idx < 0) return 0
  const midi = (Number(m[2]) + 1) * 12 + idx
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function isBlack(note: string): boolean {
  return note.includes('#')
}

export const KEYMAP: Record<string, string> = {
  a: 'C4', s: 'D4', d: 'E4', f: 'F4', g: 'G4', h: 'A4', j: 'B4',
  k: 'C5', l: 'D5', ';': 'E5',
  w: 'C#4', e: 'D#4', t: 'F#4', y: 'G#4', u: 'A#4',
  o: 'C#5', p: 'D#5'
}

export interface SongNote {
  note: string
  /** 相对拍数（1 = 一拍） */
  dur: number
}

export interface Song {
  id: string
  name: string
  bpm: number
  notes: SongNote[]
}

export const SONGS: Song[] = [
  {
    id: 'little-star',
    name: '小星星',
    bpm: 100,
    notes: [
      { note: 'C4', dur: 1 }, { note: 'C4', dur: 1 }, { note: 'G4', dur: 1 }, { note: 'G4', dur: 1 },
      { note: 'A4', dur: 1 }, { note: 'A4', dur: 1 }, { note: 'G4', dur: 2 },
      { note: 'F4', dur: 1 }, { note: 'F4', dur: 1 }, { note: 'E4', dur: 1 }, { note: 'E4', dur: 1 },
      { note: 'D4', dur: 1 }, { note: 'D4', dur: 1 }, { note: 'C4', dur: 2 }
    ]
  },
  {
    id: 'ode-to-joy',
    name: '欢乐颂',
    bpm: 108,
    notes: [
      { note: 'E4', dur: 1 }, { note: 'E4', dur: 1 }, { note: 'F4', dur: 1 }, { note: 'G4', dur: 1 },
      { note: 'G4', dur: 1 }, { note: 'F4', dur: 1 }, { note: 'E4', dur: 1 }, { note: 'D4', dur: 1 },
      { note: 'C4', dur: 1 }, { note: 'C4', dur: 1 }, { note: 'D4', dur: 1 }, { note: 'E4', dur: 1 },
      { note: 'E4', dur: 1.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 2 },
      { note: 'E4', dur: 1 }, { note: 'E4', dur: 1 }, { note: 'F4', dur: 1 }, { note: 'G4', dur: 1 },
      { note: 'G4', dur: 1 }, { note: 'F4', dur: 1 }, { note: 'E4', dur: 1 }, { note: 'D4', dur: 1 },
      { note: 'C4', dur: 1 }, { note: 'C4', dur: 1 }, { note: 'D4', dur: 1 }, { note: 'E4', dur: 1 },
      { note: 'D4', dur: 1.5 }, { note: 'C4', dur: 0.5 }, { note: 'C4', dur: 2 }
    ]
  },
  {
    id: 'birthday',
    name: '生日歌',
    bpm: 92,
    notes: [
      { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'A4', dur: 1 }, { note: 'G4', dur: 1 }, { note: 'C5', dur: 1 }, { note: 'B4', dur: 2 },
      { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'A4', dur: 1 }, { note: 'G4', dur: 1 }, { note: 'D5', dur: 1 }, { note: 'C5', dur: 2 },
      { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'G5', dur: 1 }, { note: 'E5', dur: 1 }, { note: 'C5', dur: 1 }, { note: 'B4', dur: 1 }, { note: 'A4', dur: 2 },
      { note: 'F5', dur: 0.5 }, { note: 'F5', dur: 0.5 }, { note: 'E5', dur: 1 }, { note: 'C5', dur: 1 }, { note: 'D5', dur: 1 }, { note: 'C5', dur: 2 }
    ]
  }
]

export type VoiceName = 'piano' | 'synth' | 'musicbox'

export const VOICES: { id: VoiceName; name: string }[] = [
  { id: 'piano', name: '钢琴' },
  { id: 'synth', name: '电子琴' },
  { id: 'musicbox', name: '八音盒' }
]

/** 音色包络：attack / decay / sustain 电平 / release（秒）与波形 */
export function voiceParams(v: VoiceName): { wave: OscillatorType; attack: number; decay: number; sustain: number; release: number } {
  if (v === 'piano') return { wave: 'triangle', attack: 0.005, decay: 0.9, sustain: 0.12, release: 0.25 }
  if (v === 'synth') return { wave: 'square', attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.12 }
  return { wave: 'sine', attack: 0.003, decay: 0.6, sustain: 0.06, release: 0.5 }
}

/** 同时发声上限：超出时由组件复用最旧的 voice */
export const MAX_VOICES = 8
