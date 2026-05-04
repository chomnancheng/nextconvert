/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    openFiles: () => Promise<string[]>;
    openFolder: () => Promise<string[]>;
  };
}
