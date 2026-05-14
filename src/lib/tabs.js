import { Activity, BarChart3, Gauge, Layers, Zap } from 'lucide-react';

export const TABS = [
  {
    id: 'should-i-trade',
    label: 'Should I Trade?',
    short: 'Signal',
    icon: Gauge,
    description: 'Composite market quality score',
  },
  {
    id: 'macro',
    label: 'Macro',
    short: 'Macro',
    icon: Activity,
    description: 'FRED economic indicators',
  },
  {
    id: 'internals',
    label: 'Internals',
    short: 'Internals',
    icon: BarChart3,
    description: 'Breadth, sectors, stage analysis',
  },
  {
    id: 'scanners',
    label: 'Scanners',
    short: 'Scanners',
    icon: Layers,
    description: 'Minervini, Qullamaggie, CANSLIM, ETFs',
  },
  {
    id: 'intraday',
    label: 'Intraday',
    short: 'Intraday',
    icon: Zap,
    description: 'Live market snapshot (coming soon)',
    disabled: true,
  },
];
