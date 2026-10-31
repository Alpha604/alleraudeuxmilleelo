/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info';
}

interface NotificationToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
          warning: <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />,
          info: <Info className="h-4 w-4 text-cyan-400 shrink-0" />,
        };

        const borders = {
          success: 'border-emerald-500/40 bg-neutral-950/95 text-neutral-100',
          warning: 'border-amber-500/40 bg-neutral-950/95 text-neutral-100',
          info: 'border-neutral-700 bg-neutral-950/95 text-neutral-100',
        };

        const type = toast.type || 'info';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all ${borders[type]}`}
          >
            <div className="flex items-start gap-2.5">
              {icons[type]}
              <div>
                <h4 className="text-xs font-bold">{toast.title}</h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">{toast.message}</p>
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="text-neutral-500 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
