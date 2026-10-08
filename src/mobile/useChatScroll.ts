import { useLayoutEffect, useRef } from 'react';

// Adjust before paint: opening/appending follows the conversation; prepending
// history preserves the same visible content instead of jumping to the end.
export function useChatScroll(lastId: string | undefined, firstId: string | undefined, ready: boolean, visible: boolean, busy: boolean) {
  const end = useRef<HTMLDivElement>(null);
  const previous = useRef({ lastId, firstId, ready: false, visible: false, height: 0 });
  useLayoutEffect(() => {
    const stream = end.current?.parentElement;
    const old = previous.current;
    if (stream && visible && ready) {
      const opening = !old.ready || !old.visible;
      const appended = lastId !== old.lastId;
      const prepended = !opening && !appended && firstId !== old.firstId;
      if (prepended) stream.scrollTop += stream.scrollHeight - old.height;
      else if (opening || appended || busy) stream.scrollTop = stream.scrollHeight;
    }
    previous.current = { lastId, firstId, ready, visible, height: stream?.scrollHeight ?? old.height };
  }, [lastId, firstId, ready, visible, busy]);
  useLayoutEffect(() => {
    const stream = end.current?.parentElement;
    if (!stream || !visible) return;
    let following = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 2;
    const onScroll = () => { following = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 2; };
    const observer = new ResizeObserver(() => { if (following) stream.scrollTop = stream.scrollHeight; });
    observer.observe(stream);
    stream.addEventListener('scroll', onScroll);
    return () => { observer.disconnect(); stream.removeEventListener('scroll', onScroll); };
  }, [visible, ready]);
  return end;
}
