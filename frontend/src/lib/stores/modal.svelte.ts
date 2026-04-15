import { whiteboardState } from './whiteboard.svelte';
import { regionalChatState } from './regional-chat.svelte';

class ModalStore {
  settingsOpen = $state(false);
  customStatusOpen = $state(false);

  get anyModalOpen() {
    return this.settingsOpen || this.customStatusOpen
      || whiteboardState.open || regionalChatState.settingsOpen;
  }
}

export const modalState = new ModalStore();
