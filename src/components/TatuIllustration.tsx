import React from 'react';
import waving from '../assets/tatu/tatu-acenando.png';
import laptop from '../assets/tatu/tatu-laptop.png';

const illustrations = { waving, laptop };
/** Official, unmodified artwork; decorative alongside the interface text. */
export const TatuIllustration: React.FC<{ className?: string; variant?: keyof typeof illustrations }> = ({ className = '', variant = 'waving' }) => (
  <img src={illustrations[variant]} className={className} alt="" aria-hidden="true" width={1254} height={1254} decoding="async" />
);
