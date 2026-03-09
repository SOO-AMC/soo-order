import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPhoto, deletePhotos } from "./photo";

type Listener = () => void;

interface UploadJob {
  id: string;
  orderId: string;
  total: number;
  completed: number;
  failed: boolean;
}

const jobs = new Map<string, UploadJob>();
const listeners = new Set<Listener>();
let snapshot: UploadJob[] = [];

function notify() {
  snapshot = Array.from(jobs.values());
  listeners.forEach((fn) => fn());
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUploadJobs(): UploadJob[] {
  return snapshot;
}

/**
 * Enqueue background photo uploads for a new order.
 * Resolves immediately — uploads run in background.
 */
export function enqueueNewOrderPhotos(
  supabase: SupabaseClient,
  orderId: string,
  files: File[]
) {
  if (files.length === 0) return;

  const jobId = crypto.randomUUID();
  const job: UploadJob = {
    id: jobId,
    orderId,
    total: files.length,
    completed: 0,
    failed: false,
  };
  jobs.set(jobId, job);
  notify();

  (async () => {
    try {
      const paths: string[] = [];
      for (const file of files) {
        const path = await uploadPhoto(supabase, orderId, file);
        paths.push(path);
        job.completed++;
        notify();
      }
      // Update order with photo URLs
      await supabase
        .from("orders")
        .update({ photo_urls: paths })
        .eq("id", orderId);
    } catch {
      job.failed = true;
      notify();
    } finally {
      // Remove job after a short delay for UI feedback
      setTimeout(() => {
        jobs.delete(jobId);
        notify();
      }, job.failed ? 3000 : 1000);
    }
  })();
}

/**
 * Enqueue background photo uploads for an edited order.
 * Updates photo_urls with kept + new paths, deletes removed.
 */
export function enqueueEditOrderPhotos(
  supabase: SupabaseClient,
  orderId: string,
  keptPaths: string[],
  newFiles: File[],
  deletedPaths: string[]
) {
  if (newFiles.length === 0 && deletedPaths.length === 0) return;

  const jobId = crypto.randomUUID();
  const job: UploadJob = {
    id: jobId,
    orderId,
    total: newFiles.length,
    completed: 0,
    failed: false,
  };
  jobs.set(jobId, job);
  notify();

  (async () => {
    try {
      const newPaths: string[] = [];
      for (const file of newFiles) {
        const path = await uploadPhoto(supabase, orderId, file);
        newPaths.push(path);
        job.completed++;
        notify();
      }

      const finalPaths = [...keptPaths, ...newPaths];
      await supabase
        .from("orders")
        .update({ photo_urls: finalPaths })
        .eq("id", orderId);

      // Delete removed photos (best-effort)
      if (deletedPaths.length > 0) {
        await deletePhotos(supabase, deletedPaths).catch(() => {});
      }
    } catch {
      job.failed = true;
      notify();
    } finally {
      setTimeout(() => {
        jobs.delete(jobId);
        notify();
      }, job.failed ? 3000 : 1000);
    }
  })();
}
