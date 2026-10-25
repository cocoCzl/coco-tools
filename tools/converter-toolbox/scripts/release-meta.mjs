import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '..')
export const packageInfo = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
export const archiveName = `converter-toolbox-v${packageInfo.version}.zip`
