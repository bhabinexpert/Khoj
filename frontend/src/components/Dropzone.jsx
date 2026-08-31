import { useRef, useState } from 'react';
import { Spinner, UploadIcon } from './Icons.jsx';
import { formatBytes } from '../lib/format.js';

const ACCEPT = '.pdf,.docx,.doc';
const EXTENSIONS = /\.(pdf|docx|doc)$/i;

/**
 * Drag-and-drop (or click) file picker. Size and extension are checked here so
 * an obviously wrong file never costs a round-trip — the backend enforces the
 * same limits again, since a client-side check is a convenience, not a control.
 */
export function Dropzone({ onFile, busy = false, maxBytes = 5 * 1024 * 1024 }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState(null);

  function accept(file) {
    setLocalError(null);
    if (!file) return;
    if (!EXTENSIONS.test(file.name)) {
      setLocalError(`"${file.name}" is not a PDF or Word document.`);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(`That file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    onFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-white'
        }`}
      >
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          {busy ? <Spinner className="h-8 w-8 text-brand-600" /> : <UploadIcon className="h-8 w-8 text-ink-400" />}
          <div>
            <p className="text-sm font-semibold text-ink-800">
              {busy ? 'Reading your CV…' : 'Drop your CV here'}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              PDF or Word, up to {formatBytes(maxBytes)}. It is parsed and returned, never stored on the server.
            </p>
          </div>

          <button type="button" className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            Choose a file
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              accept(event.target.files?.[0]);
              // Reset so re-picking the same file fires `change` again.
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {localError ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
