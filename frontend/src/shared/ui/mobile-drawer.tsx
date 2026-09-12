'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface MobileDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function MobileDrawer({ open, title, onClose, children }: MobileDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[88vw] max-w-sm flex-col border-l border-rule-strong bg-black lg:hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-rule px-4 py-3">
              <span className="font-label text-[13px] text-zinc-300">{title}</span>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close panel">
                <X size={18} />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
