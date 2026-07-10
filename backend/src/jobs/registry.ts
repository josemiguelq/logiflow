import type { Job } from './types'
import { locationRetentionJob } from './location-retention.job'

// Registro central de workers. Para adicionar um novo worker ao mesmo service,
// implemente a interface Job e inclua aqui — o runner (worker.ts) cuida de
// agendar, selecionar (env WORKERS) e do modo one-shot. Nada mais precisa mudar
// (Dockerfile.worker e service do EasyPanel continuam iguais).
export const jobs: Job[] = [
  locationRetentionJob,
]
