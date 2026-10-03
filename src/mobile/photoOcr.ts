export async function readPhoto(file: File, signal: AbortSignal, progress: (value: number) => void): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma foto, não um documento PDF.');
  if (file.size > 15 * 1024 * 1024) throw new Error('A foto deve ter até 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('Não foi possível preparar a foto.'); }
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
  const { createWorker } = await import('tesseract.js');
  const { default: workerPath } = await import('tesseract.js/dist/worker.min.js?url');
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = () => { void worker?.terminate(); rejectAbort(new DOMException('Cancelado', 'AbortError')); };
  signal.addEventListener('abort', cancel, { once: true });
  const work = (async () => {
    worker = await createWorker('por+eng', 1, { workerPath, cacheMethod: 'none', errorHandler: () => {}, logger: event => {
      if (!signal.aborted && event.status === 'recognizing text') progress(Math.round(event.progress * 100));
    } });
    if (signal.aborted) { await worker.terminate(); throw new DOMException('Cancelado', 'AbortError'); }
    return (await worker.recognize(canvas)).data.text;
  })();
  if (signal.aborted) cancel();
  try { return await Promise.race([work, aborted]); }
  finally { signal.removeEventListener('abort', cancel); void worker?.terminate(); canvas.width = canvas.height = 0; }
}
