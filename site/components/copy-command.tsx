'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/icons';

/**
 * A terminal command with a copy button. The prompt character is decorative and is
 * excluded from what gets copied.
 */
export function CopyCommand({ command, prompt = '$' }: { command: string; prompt?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the command stays selectable by hand.
    }
  }, [command]);

  return (
    <div className="command-block">
      <code className="command-block__code">
        <span className="command-block__prompt" aria-hidden="true">
          {prompt}{' '}
        </span>
        {command}
      </code>
      <button
        type="button"
        className="command-block__copy"
        onClick={copy}
        aria-label={copied ? 'Command copied' : `Copy command: ${command}`}
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </button>
      <span role="status" aria-live="polite" className="visually-hidden">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}
