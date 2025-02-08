import fs from "fs/promises"
import Logger from "@UT/logger"
import axios, { AxiosError } from "axios"
import https from "https"
import crypto from "crypto"
import os from "os"
import path from "path"

const log = new Logger("Library")

export function getLocalIpAddress(): string {
	const networkInterfaces = os.networkInterfaces()
	for (const ifaceName in networkInterfaces) {
		const iface = networkInterfaces[ifaceName]
		if (iface == undefined) {
			return "?"
		}
		for (const entry of iface) {
			if (!entry.internal && entry.family === "IPv4") {
				return entry.address
			}
		}
	}
	return "Unknown"
}

export function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, 1000 * ms)
	})
}

export function removeControlChars(str: string): string {
	return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
}

function trimAny(str: string, chars: string = " "): string {
	let start = 0,
		end = str.length

	while (start < end && chars.indexOf(str[start]) >= 0) ++start
	while (end > start && chars.indexOf(str[end - 1]) >= 0) --end

	return start > 0 || end < str.length ? str.substring(start, end) : str
}

export async function forceDownload(link: string, fileFullPath: string, maxRetries: number = 3): Promise<boolean> {
	link = trimAny(removeControlChars(link))
	fileFullPath = trimAny(removeControlChars(fileFullPath))

	const dir = path.dirname(fileFullPath)
	await fs.mkdir(dir, { recursive: true }).catch((err) => log.errorNoStack(`Failed to create directory: ${dir}`, err))

	const fileExists = await fs
		.access(fileFullPath)
		.then(() => true)
		.catch(() => false)
	if (fileExists) {
		const isRemove = await fs
			.unlink(fileFullPath)
			.then(() => true)
			.catch(() => false)
		log.warn(`Found file ${fileFullPath}, removed: ${isRemove}`)
	}

	log.debug(`Start downloading file ${link} > ${fileFullPath}`)

	let attempt = 0
	while (attempt < maxRetries) {
		try {
			const response = await axios.get(link, {
				responseType: "arraybuffer",
				timeout: 1000 * 300,
				httpsAgent: new https.Agent({
					rejectUnauthorized: false
				})
			})

			if (response.status == 404) {
				log.errorNoStack(`File ${link} not found1`)
				return false
			}
			if (response.status !== 200) {
				log.errorNoStack(`File failed to download ${link}:`, response.statusText)
				attempt++
				continue
			}

			const isSave = await fs
				.writeFile(fileFullPath, response.data)
				.then(() => true)
				.catch((err) => {
					log.errorNoStack(`Failed to save file ${fileFullPath}:`, err)
					return false
				})

			log.info(`File saved ${isSave} > ${fileFullPath} > ${link}`)
			return true
		} catch (error) {
			const c = error as AxiosError

			if (c.status == 404) {
				log.errorNoStack(`File ${link} not found2`)
				return false
			}

			log.errorNoStack(`Error downloading file: ${link}, try ${attempt}`, c.status, c.message)
			attempt++
			await sleep(5)
		}
	}

	log.errorNoStack(`Failed to download file after ${maxRetries} attempts: ${link}`)
	return false
}

export function getMD5Hash(inputString: string): string {
	const hash = crypto.createHash("md5")
	hash.update(inputString)
	return hash.digest("hex")
}

export async function getMD5HashFile(filePath: string, expectedMd5: string): Promise<boolean> {
	try {
		// Read file data
		const fileData = await fs.readFile(filePath)
		// Calculate the MD5 hash
		const hash = crypto.createHash("md5").update(fileData).digest("hex")
		// Compare hashes
		return hash === expectedMd5
	} catch (error) {
		log.debug(`Error reading or hashing file: ${filePath}`, error)
		return false
	}
}

export interface Md5Data {
	remoteName?: string
	md5?: string
	fileSize?: number
	isPatch?: boolean
	localName?: string
}

export async function loadCache(CACHE_FILE: string): Promise<Record<string, any>> {
	try {
		const data = await fs.readFile(CACHE_FILE, "utf-8")
		return JSON.parse(data)
	} catch {
		return {}
	}
}

export async function saveCache(CACHE_FILE: string, cache: Record<string, any>) {
	const dir = path.dirname(CACHE_FILE)
	await fs.mkdir(dir, { recursive: true }).catch(() => {})

	await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8").catch((err) => {
		log.errorNoStack(`Failed to save cache file ${CACHE_FILE}:`, err.message)
	})
}

export function getMd5Data(x: string): Md5Data {
	let y: Md5Data = {}

	if (x.startsWith("{")) {
		y = JSON.parse(x)
	} else {
		const parts = x.split(" ")
		const [remoteName, fileInfo] = parts
		const [md5, fileSize] = fileInfo.split("|")

		y = {
			remoteName: remoteName,
			md5: md5,
			fileSize: parseInt(fileSize, 10)
		}

		if (parts.length > 2) {
			y.isPatch = true
			if (parts.length > 3) {
				y.localName = parts[3]
			}
		}
	}
	return y
}
