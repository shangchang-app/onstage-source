'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* 弹窗：渲染到 body；打开时焦点进入弹窗，Tab 不离开弹窗，Esc 关闭，背景不可操作，关闭后焦点回到打开前的元素。 */
/* variant='sheet'：窄屏时从底部弹出的抽屉（用于随时查看任务材料）。returnFocus：关闭后要回到的元素（默认是打开前的焦点）。 */
export function Modal({ open, title, onClose, children, footer, role = 'dialog', variant, wide, returnFocus }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; role?: 'dialog' | 'alertdialog'; variant?: 'sheet'; wide?: boolean; returnFocus?: () => HTMLElement | null | undefined }) {
  const box = useRef<HTMLDivElement>(null), before = useRef<HTMLElement | null>(null), id = useId();
  const close = useRef(onClose); close.current = onClose; const back = useRef(returnFocus); back.current = returnFocus;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open || !mounted) return;
    before.current = document.activeElement as HTMLElement;
    const el = box.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    (focusables()[0] || el).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    const shell = document.querySelector('.shell'); shell?.setAttribute('inert', '');
    return () => { document.removeEventListener('keydown', key); shell?.removeAttribute('inert'); const target = back.current?.() || before.current; if (target && document.contains(target)) target.focus(); };
  }, [open, mounted]);
  if (!open || !mounted) return null;
  return createPortal(<div className={'overlay' + (variant ? ' ' + variant : '')} onMouseDown={e => { if (e.target === e.currentTarget) close.current(); }}>
    <div className={'modal' + (variant ? ' ' + variant : '') + (wide ? ' wide' : '')} role={role} aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
      <div className="modal-top"><h2 className="modal-h" id={id}>{title}</h2>{variant === 'sheet' && <button type="button" className="btn btn-sm sheet-x" onClick={() => close.current()}>关闭</button>}</div>
      <div className="modal-b">{children}</div>
      {footer && <div className="modal-f">{footer}</div>}
    </div>
  </div>, document.body);
}
