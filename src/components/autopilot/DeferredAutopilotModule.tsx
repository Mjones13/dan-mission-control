import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

interface DeferredAutopilotModuleProps {
  title?: string;
  backHref?: string;
}

export function DeferredAutopilotModule({
  title = 'Product Autopilot is deferred for v1',
  backHref = '/',
}: DeferredAutopilotModuleProps) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center p-6">
      <div className="max-w-xl rounded-2xl border border-amber-500/30 bg-mc-bg-secondary p-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-amber-500/10 p-3 text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Disabled module</p>
              <h1 className="mt-1 text-2xl font-bold text-mc-text">{title}</h1>
            </div>
            <p className="text-sm leading-6 text-mc-text-secondary">
              Product Autopilot, Field Ops, external actions, and dispatch-style product automation are disabled in the OpenClaw-native v1 experience. This route is kept only as a deferred placeholder, so no product workflow, research run, build queue, swipe action, or external action can launch from here by default.
            </p>
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center rounded-lg bg-mc-accent px-4 text-sm font-medium text-mc-bg hover:bg-mc-accent/90"
            >
              Return to Mission Control
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
