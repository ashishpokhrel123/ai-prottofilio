"use client";

import { motion } from "framer-motion";
import { ExternalLink, Github, Star, FolderGit2 } from "lucide-react";
import type { ProjectCard } from "@ai-portfolio/shared";

/**
 * Projects the agent actually retrieved, rendered as cards.
 *
 * The prose answer is generated; these fields come straight from the database
 * row the tool returned, so a repository link here can't be a hallucination.
 */
export function ProjectCards({ projects }: { projects: ProjectCard[] }) {
  if (projects.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <FolderGit2 size={12} className="text-violet-400" />
        {projects.length === 1 ? "Project" : `Projects (${projects.length})`}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className="group rounded-xl border border-white/10 bg-slate-950/50 p-3 transition-all duration-200 hover:border-violet-500/30 hover:bg-slate-950/80"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white">
                  {project.name}
                </span>
                {project.featured && (
                  <Star
                    size={11}
                    className="fill-amber-400 text-amber-400"
                    aria-label="Featured"
                  />
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {project.githubUrl && (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${project.name} on GitHub`}
                    className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
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
                    className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>

            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
              {project.summary}
            </p>

            {project.technologies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {project.technologies.slice(0, 6).map((tech) => (
                  <span
                    key={tech}
                    className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-300"
                  >
                    {tech}
                  </span>
                ))}
                {project.technologies.length > 6 && (
                  <span className="px-1 py-0.5 font-mono text-[10px] text-slate-500">
                    +{project.technologies.length - 6}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
