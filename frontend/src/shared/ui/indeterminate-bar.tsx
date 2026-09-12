'use client';

import { motion } from 'motion/react';

export function IndeterminateBar() {
  return (
    <div className="relative h-px w-full overflow-hidden bg-rule-strong">
      <motion.span
        className="absolute inset-y-0 left-0 w-1/3 bg-zinc-300"
        animate={{ x: ['-110%', '330%'] }}
        transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
      />
    </div>
  );
}
