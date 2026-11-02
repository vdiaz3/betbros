// Envoltura de voice-ring (React) para el kiosco, que es JavaScript sin compilar: expone
// mountVoiceRing(el, props) → { update(props), unmount() }. Ver build.sh.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceRing } from 'voice-ring';

export function mountVoiceRing(el, props) {
  const root = createRoot(el);
  let current = { ...props };
  const render = () => root.render(createElement(VoiceRing, current));
  render();
  return {
    update(patch) { current = { ...current, ...patch }; render(); },
    unmount() { root.unmount(); },
  };
}
