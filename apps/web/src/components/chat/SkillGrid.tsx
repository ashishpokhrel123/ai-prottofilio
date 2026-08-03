"use client";

import { motion } from "framer-motion";
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
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {categories.map(([category, items], i) => (
          <motion.div
            key={category}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="mb-4"
          >
            <div className="label-meta mb-1 border-b border-panel-line pb-1">
              {category}
            </div>

            <ul>
              {items.map((skill) => (
                <li
                  key={skill.name}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <span className="truncate text-[12.5px] text-zinc-400">
                    {skill.name}
                  </span>
                  <span
                    className="flex shrink-0 gap-px"
                    role="img"
                    aria-label={`${skill.level} out of ${MAX_LEVEL}`}
                  >
                    {/* Square pips, not dots. Circles were the only rounded
                        geometry left in a design built entirely on rectangles. */}
                    {Array.from({ length: MAX_LEVEL }, (_, pip) => (
                      <span
                        key={pip}
                        className={`h-2 w-1.5 ${
                          pip < skill.level
                            ? "bg-gradient-to-b from-gemini-400 to-gemini-600"
                            : "bg-panel-line"
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
