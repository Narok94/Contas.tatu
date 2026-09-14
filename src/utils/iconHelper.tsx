import React from 'react';
import {
  Home,
  Droplets,
  Zap,
  Wifi,
  HeartPulse,
  Dumbbell,
  CreditCard,
  ShoppingBag,
  Utensils,
  Car,
  GraduationCap,
  Layers,
  Repeat,
  Receipt,
  Tv,
  Sparkles,
  Tag,
  ShieldCheck,
} from 'lucide-react';

export function getCategoryOrTypeIcon(
  categoryName?: string,
  accountType?: 'simple' | 'recurring' | 'installment' | 'credit_card',
  className: string = 'w-3.5 h-3.5'
): React.ReactNode {
  const norm = (categoryName || '').toLowerCase().trim();

  if (norm.includes('casa') || norm.includes('aluguel') || norm.includes('condom') || norm.includes('moradia')) {
    return <Home className={className} />;
  }
  if (norm.includes('água') || norm.includes('agua') || norm.includes('saneamento')) {
    return <Droplets className={className} />;
  }
  if (norm.includes('luz') || norm.includes('energia') || norm.includes('elétric') || norm.includes('eletric')) {
    return <Zap className={className} />;
  }
  if (norm.includes('internet') || norm.includes('wifi') || norm.includes('tele') || norm.includes('celular')) {
    return <Wifi className={className} />;
  }
  if (norm.includes('saúde') || norm.includes('saude') || norm.includes('médic') || norm.includes('medic') || norm.includes('farmácia') || norm.includes('farmacia')) {
    return <HeartPulse className={className} />;
  }
  if (norm.includes('academia') || norm.includes('treino') || norm.includes('fitness') || norm.includes('esporte')) {
    return <Dumbbell className={className} />;
  }
  if (norm.includes('streaming') || norm.includes('tv') || norm.includes('netflix') || norm.includes('spotify') || norm.includes('assinat')) {
    return <Tv className={className} />;
  }
  if (norm.includes('mercado') || norm.includes('supermercado') || norm.includes('compra')) {
    return <ShoppingBag className={className} />;
  }
  if (norm.includes('aliment') || norm.includes('restaurante') || norm.includes('lanche') || norm.includes('ifood')) {
    return <Utensils className={className} />;
  }
  if (norm.includes('carro') || norm.includes('combustív') || norm.includes('combustiv') || norm.includes('uber') || norm.includes('transporte')) {
    return <Car className={className} />;
  }
  if (norm.includes('educa') || norm.includes('faculdade') || norm.includes('curso') || norm.includes('escola')) {
    return <GraduationCap className={className} />;
  }
  if (norm.includes('seguro') || norm.includes('proteç')) {
    return <ShieldCheck className={className} />;
  }
  if (norm.includes('lazer') || norm.includes('viagem')) {
    return <Sparkles className={className} />;
  }

  // Fallback by account type
  if (accountType === 'credit_card') {
    return <CreditCard className={className} />;
  }
  if (accountType === 'installment') {
    return <Layers className={className} />;
  }
  if (accountType === 'recurring') {
    return <Repeat className={className} />;
  }
  if (categoryName) {
    return <Tag className={className} />;
  }

  return <Receipt className={className} />;
}
