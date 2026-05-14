import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { NetworkStatus } from '@/lib/api';

const colorClasses: Record<string, { ring: string; text: string }> = {
  amber: { ring: 'ring-amber-500', text: 'text-amber-500' },
  green: { ring: 'ring-green-500', text: 'text-green-500' },
  red: { ring: 'ring-red-500', text: 'text-red-500' },
};

interface NetworkStatsRowProps {
  counts: Record<NetworkStatus, number>;
  activeTab: NetworkStatus | 'ALL';
  onSelect: (status: NetworkStatus) => void;
}

const ITEMS = [
  { status: 'PENDING' as const, label: 'Pending', icon: Clock, color: 'amber' },
  { status: 'VERIFIED' as const, label: 'Verified', icon: CheckCircle2, color: 'green' },
  { status: 'REJECTED' as const, label: 'Rejected', icon: XCircle, color: 'red' },
];

export function NetworkStatsRow({ counts, activeTab, onSelect }: NetworkStatsRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {ITEMS.map((item) => {
        const palette = colorClasses[item.color];
        return (
          <Card
            key={item.status}
            className={`cursor-pointer transition-all ${
              activeTab === item.status ? `ring-2 ${palette?.ring ?? 'ring-gray-500'}` : ''
            }`}
            onClick={() => onSelect(item.status)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{item.label}</p>
                <p className="text-2xl font-bold">{counts[item.status]}</p>
              </div>
              <item.icon className={`h-8 w-8 ${palette?.text ?? 'text-gray-500'} opacity-50`} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
