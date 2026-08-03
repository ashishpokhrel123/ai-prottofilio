"use client";

import { motion } from "framer-motion";
import { ExternalLink, Github, Star } from "lucide-react";
import type { ProjectCard } from "@ai-portfolio/shared";

/**
 * Projects the agent actually retrieved, rendered as cards.
 *
 * The prose answer is generated; these fields come straight from the database
 * row the tool returned, so a repository link here can't be a hallucination.
 */
export function ProjectCards({ projects }: { projects: ProjectCard[] }) {
  if (projects.length === 0) return null;

  // No "projects · 3" heading. The answer above already said these are
  // projects, and the count is visible by looking at them.
  return (
    <div className="mt-4">
      <div className="border-t border-panel-line">
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="group -mx-2 rounded-xl border-b border-panel-line px-2 py-2.5 transition-colors last:border-b-0 hover:bg-panel-hover"
          >
            <div className="relative flex items-start justify-between gap-2 rounded-lg transition-colors">
              {/* Accent tick — appears on hover to mark the row as actionable,
                  matching the square grammar of the rest of the interface. */}
              <span
                aria-hidden
                className="absolute -left-2 top-1 hidden h-4 w-px bg-gradient-to-b from-gemini-400 to-transparent group-hover:block"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-medium text-zinc-100 transition-colors group-hover:text-zinc-50">
                  {project.name}
                </span>
                {project.featured && (
                  <Star
                    size={10}
                    className="fill-signal text-signal"
                    aria-label="Featured"
                  />
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {project.githubUrl && (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${project.name} on GitHub`}
                    className="text-zinc-600 transition-colors hover:text-zinc-200"
                  >
                    <Github size={13} />
                  </a>
                )}
                {project.liveUrl && (
                  <a
                    href={project.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${project.name} live site`}
                    className="text-zinc-600 transition-colors hover:text-zinc-200"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>

            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500">
              {project.summary}
            </p>

            {project.technologies.length > 0 && (
              /* Space-separated mono rather than pills. Six bordered chips
                 introduce twelve edges into a layout whose whole grammar is
                 the hairline; a mono run reads as a manifest line instead. */
              <p className="mt-1.5 truncate font-mono text-meta text-zinc-700">
                {project.technologies.slice(0, 8).join("  ·  ")}
                {project.technologies.length > 8 &&
                  `  +${project.technologies.length - 8}`}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
