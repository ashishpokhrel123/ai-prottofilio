'use client';

import { motion } from 'framer-motion';
import { User, Sparkles, Cpu, Code2, Briefcase, Compass } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';

const PROMPTS = [
  { text: 'Tell me about yourself', icon: User, category: 'Bio' },
  { text: 'Show me your AI & RAG projects', icon: Sparkles, category: 'Projects' },
  { text: 'What is your Immortalis project?', icon: Cpu, category: 'Architecture' },
  { text: 'What technologies & stack do you use?', icon: Code2, category: 'Skills' },
  { text: "I'm hiring an AI Engineer — match my job fit", icon: Briefcase, category: 'Career' },
  { text: 'What AWS & Cloud services have you built on?', icon: Compass, category: 'Cloud' },
];

export function SuggestedPrompts() {
  const { send, isStreaming } = useChatStore();

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-medium uppercase tracking-wider text-slate-400">
        Suggested Inquiries
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {PROMPTS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={p.text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              disabled={isStreaming}
              onClick={() => void send(p.text)}
              className="glass-card-hover group flex items-start gap-3 rounded-xl p-3 text-left disabled:opacity-40"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-cyan-400 transition-colors group-hover:border-cyan-400/50 group-hover:bg-cyan-400/10">
                <Icon size={14} />
              </div>
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold text-slate-200 group-hover:text-white">
                  {p.text}
                </span>
                <span className="block text-[10px] font-mono text-slate-400 group-hover:text-cyan-300">
                  {p.category}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
