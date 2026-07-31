"use client";

import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { SkillGroups } from "@ai-portfolio/shared";

const MAX_LEVEL = 5;

/**
 * Skills grouped by category, with proficiency as a bar rather than a number.
 *
 * A "4/5" in prose is easy to skim past; five pips are comparable at a glance,
 * which is the only reason this beats the text the model already wrote.
 */
export function SkillGrid({ skills }: { skills: SkillGroups }) {
  const categories = Object.entries(skills).filter(
    ([, items]) => items.length > 0,
  );

  if (categories.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Layers size={12} className="text-emerald-400" /> Skills
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map(([category, items], i) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">
              {category}
            </div>

            <ul className="space-y-1.5">
              {items.map((skill) => (
                <li
                  key={skill.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-xs text-slate-300">
                    {skill.name}
                  </span>
                  <span
                    className="flex shrink-0 gap-0.5"
                    role="img"
                    aria-label={`${skill.level} out of ${MAX_LEVEL}`}
                  >
                    {Array.from({ length: MAX_LEVEL }, (_, pip) => (
                      <span
                        key={pip}
                        className={`h-1.5 w-1.5 rounded-full ${
                          pip < skill.level
                            ? "bg-emerald-400"
                            : "bg-white/[0.12]"
                        }`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
