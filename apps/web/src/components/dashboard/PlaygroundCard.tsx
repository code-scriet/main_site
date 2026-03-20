import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Code2, ArrowRight, Zap, FileCode2, PlayCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const BASE_PLAYGROUND_URL = import.meta.env.VITE_PLAYGROUND_URL || 
  (import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev');

/** Build playground URL with JWT in hash so the playground can auto-authenticate */
function getPlaygroundUrl(): string {
  const token = localStorage.getItem('token');
  if (token) {
    return `${BASE_PLAYGROUND_URL}/#token=${encodeURIComponent(token)}`;
  }
  return BASE_PLAYGROUND_URL;
}

export function PlaygroundCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      <Card className="relative overflow-hidden border-gray-100 shadow-sm hover:shadow-md transition-all group">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 opacity-60 group-hover:opacity-100 transition-opacity" />

        {/* Animated Code Icon Background */}
        <div className="absolute top-0 right-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
          <Code2 className="h-32 w-32 text-amber-600 transform rotate-12" />
        </div>

        <CardContent className="relative p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {/* Icon */}
            <div className="shrink-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
                <Code2 className="h-7 w-7 text-white" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900">
                  Code Playground
                </h3>
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Zap className="h-3 w-3" />
                  Online IDE
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Want to code without the hassle of setting up an environment? 
                Jump into our online playground and start coding instantly in Python, JavaScript, C++, and more!
              </p>

              {/* Features */}
              <div className="flex flex-wrap gap-3 pt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <FileCode2 className="h-3.5 w-3.5 text-gray-400" />
                  7+ Languages
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Zap className="h-3.5 w-3.5 text-gray-400" />
                  Instant Execution
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <PlayCircle className="h-3.5 w-3.5 text-gray-400" />
                  Save Snippets
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="shrink-0 w-full md:w-auto">
              <Button
                asChild
                className="w-full md:w-auto bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg transition-all group-hover:scale-105"
                size="lg"
              >
                <a 
                  href={getPlaygroundUrl()} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <PlayCircle className="h-5 w-5" />
                  Launch Playground
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
