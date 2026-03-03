/**
 * PollResultsView — visualizes poll results with multiple chart types and export options.
 * 
 * Features:
 * - Horizontal bar chart (primary view)
 * - Pie/Donut chart (toggle)
 * - Export options: PNG, SVG, CSV
 * - No correct/wrong highlighting — polls are opinion-based
 */

import { memo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  ChevronDown,
  Image,
  FileText,
  Clipboard,
  Check,
} from 'lucide-react';

interface PollResultsViewProps {
  distribution: Record<string, number>;
  options: string[] | null;
  questionText: string;
  totalVotes: number;
}

// Site-palette chart colors
const CHART_COLORS = [
  '#f59e0b', // amber-500
  '#f97316', // orange-500
  '#d97706', // amber-600
  '#ea580c', // orange-600
  '#b45309', // amber-700
  '#c2410c', // orange-700
  '#92400e', // amber-800
  '#9a3412', // orange-800
];

export const PollResultsView = memo(function PollResultsView({
  distribution,
  options,
  questionText,
  totalVotes,
}: PollResultsViewProps) {
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Prepare data sorted by count
  const chartData = (options
    ? options.map((opt) => ({
        label: opt,
        count: distribution[opt] || 0,
        percentage: Math.round(((distribution[opt] || 0) / (totalVotes || 1)) * 100),
      }))
    : Object.entries(distribution).map(([label, count]) => ({
        label,
        count,
        percentage: Math.round((count / (totalVotes || 1)) * 100),
      }))
  ).sort((a, b) => b.count - a.count);

  // Export handlers
  const exportPNG = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      // Dynamic import for code splitting
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `poll-${questionText.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    }
    setExportOpen(false);
  }, [questionText]);

  const exportSVG = useCallback(() => {
    if (!chartRef.current) return;
    const svgElement = chartRef.current.querySelector('svg');
    if (!svgElement) return;

    const clone = svgElement.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `poll-${questionText.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [questionText]);

  const exportCSV = useCallback(() => {
    const header = 'Option,Votes,Percentage\n';
    const rows = chartData.map((d) => `"${d.label}",${d.count},${d.percentage}%`).join('\n');
    const csv = header + rows;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `poll-${questionText.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [chartData, questionText]);

  const copyToClipboard = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      });
    } catch (err) {
      console.error('Copy failed:', err);
    }
    setExportOpen(false);
  }, []);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; payload: { label: string; percentage: number } }[] }) => {
    if (!active || !payload?.[0]) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-white shadow-lg rounded-lg px-3 py-2 border border-amber-200">
        <p className="font-semibold text-amber-900 text-sm">{data.label}</p>
        <p className="text-xs text-amber-700/60">
          {payload[0].value} votes ({data.percentage}%)
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header with chart toggle and export */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest">Poll Results</h4>
        <div className="flex items-center gap-2">
          {/* Chart type toggle — site tab pattern */}
          <div className="flex bg-amber-100/60 rounded-lg p-0.5">
            <button
              onClick={() => setChartType('bar')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5',
                chartType === 'bar'
                  ? 'bg-white text-amber-800 shadow-sm'
                  : 'text-amber-700/50 hover:text-amber-700',
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Bar
            </button>
            <button
              onClick={() => setChartType('pie')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5',
                chartType === 'pie'
                  ? 'bg-white text-amber-800 shadow-sm'
                  : 'text-amber-700/50 hover:text-amber-700',
              )}
            >
              <PieChartIcon className="h-3.5 w-3.5" />
              Pie
            </button>
          </div>

          {/* Export dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 h-7 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Save
              <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', exportOpen && 'rotate-180')} />
            </Button>
            <AnimatePresence>
              {exportOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-amber-200/60 py-1 z-50"
                >
                  <button
                    onClick={exportPNG}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    <Image className="h-3.5 w-3.5 text-amber-500" />
                    Save as PNG
                  </button>
                  <button
                    onClick={exportSVG}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-500" />
                    Save as SVG
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Clipboard className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                  <div className="border-t border-amber-100 my-1" />
                  <button
                    onClick={exportCSV}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-500" />
                    Export data as CSV
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Chart container */}
      <Card className="border-amber-200/60 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5" ref={chartRef}>
          <AnimatePresence mode="wait">
            {chartType === 'bar' ? (
              <motion.div
                key="bar"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-64"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#92400e' }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#78350f' }}
                      width={90}
                      tickFormatter={(value: string) => value.length > 12 ? value.slice(0, 12) + '...' : value}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="count"
                      radius={[0, 6, 6, 0]}
                      animationDuration={800}
                    >
                      {chartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            ) : (
              <motion.div
                key="pie"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-64"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="label"
                      animationDuration={800}
                    >
                      {chartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, props) => {
                        const percentage = (props?.payload as { percentage?: number })?.percentage ?? 0;
                        return [`${value} votes (${percentage}%)`, ''];
                      }}
                    />
                    <Legend
                      formatter={(value: string) =>
                        value.length > 15 ? value.slice(0, 15) + '...' : value
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Vote summary */}
      <p className="text-center text-xs font-medium text-amber-700/50">
        Total responses: <span className="font-semibold text-amber-800">{totalVotes}</span>
      </p>
    </div>
  );
});
