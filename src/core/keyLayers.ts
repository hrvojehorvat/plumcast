/**
 * Who gets a remote key. Full-screen layers (player, dialogs) stack up; only the newest one gets the key.
 * With no layer open, the key goes to the screen's spatial navigation (the base). So a key is never
 * handled twice, e.g. by a dialog and the player under it, or by the player and the page behind it.
 */
export function createKeyLayers<K>() {
  const layers: Array<{ handle: (key: K) => void }> = [];
  let base: { handle: (key: K) => void } | null = null;
  return {
    /** Opens a layer on top; returns the function that removes it (in any order). */
    push(handle: (key: K) => void): () => void {
      const layer = { handle };
      layers.push(layer);
      return () => {
        const i = layers.indexOf(layer);
        if (i >= 0) layers.splice(i, 1);
      };
    },
    /** The screen's handler, used while no layer is open; returns the function that removes it. */
    setBase(handle: (key: K) => void): () => void {
      const entry = { handle };
      base = entry;
      return () => {
        if (base === entry) base = null;
      };
    },
    dispatch(key: K) {
      const top = layers[layers.length - 1];
      if (top) top.handle(key);
      else base?.handle(key);
    },
    get depth() {
      return layers.length;
    },
  };
}
