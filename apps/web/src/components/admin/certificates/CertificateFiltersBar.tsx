import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CERT_TYPES, type CertType } from '@/components/admin/certificates/CertTypeBadge';

interface CertificateFiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: CertType | '') => void;
  onRefresh: () => void;
}

export function CertificateFiltersBar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onRefresh,
}: CertificateFiltersBarProps) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ds-text-3)]" />
          <Input
            placeholder="Search name, email, event, or cert ID…"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          aria-label="Filter by certificate type"
          value={typeFilter}
          onChange={e => onTypeFilterChange(e.target.value as CertType | '')}
          className="border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Types</option>
          {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </CardContent>
    </Card>
  );
}
