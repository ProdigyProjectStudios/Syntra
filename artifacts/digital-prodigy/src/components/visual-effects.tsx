import { NeuralField } from './neural-field';
import { ClickBurst } from './click-burst';

export function VisualEffects({ energy, paused }: { energy: number; paused: boolean }) {
  return <><NeuralField energy={energy} paused={paused} /><ClickBurst /></>;
}
