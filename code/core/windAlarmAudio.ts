/** Looping two-tone siren for native wake-on-wind. Web only. */

let ctx = null;
let nodes = [];
let timer = null;

export function stopWindAlarmAudio() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const n of nodes) {
    try {
      n.stop?.();
      n.disconnect?.();
    } catch {
      /* ignore */
    }
  }
  nodes = [];
}

export async function startWindAlarmAudio() {
  if (typeof window === 'undefined') return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  stopWindAlarmAudio();
  try {
    ctx = ctx && ctx.state !== 'closed' ? ctx : new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    nodes = [osc, gain];
    let high = true;
    timer = setInterval(() => {
      high = !high;
      try {
        osc.frequency.setValueAtTime(high ? 880 : 587, ctx.currentTime);
      } catch {
        /* ignore */
      }
    }, 320);
    return true;
  } catch {
    return false;
  }
}
