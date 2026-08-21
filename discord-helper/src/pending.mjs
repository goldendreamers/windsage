import { randomBytes } from "node:crypto";

const jobs = new Map();
const TTL_MS = 60_000;

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.expires <= now) jobs.delete(id);
  }
}

setInterval(sweep, 15_000).unref();

export function putJob(job) {
  sweep();
  const id = randomBytes(8).toString("hex");
  jobs.set(id, { ...job, expires: Date.now() + TTL_MS });
  return id;
}

export function getJob(id) {
  sweep();
  return jobs.get(id) || null;
}

export function deleteJob(id) {
  jobs.delete(id);
}
