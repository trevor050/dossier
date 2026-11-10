// Lazy bundle for the replay player: loaded only when a session with a replay is opened.
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

(window as unknown as { rrwebPlayer: unknown }).rrwebPlayer = rrwebPlayer;
