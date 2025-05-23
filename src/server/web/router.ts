import express, { Request, Response } from "express"
import Logger from "@UT/logger"
import path, { basename, dirname, join } from "path"
import fs from "fs/promises"
import axios, { AxiosError } from "axios"

const r = express.Router()
const log = new Logger("Web")

r.all("/", (req: Request, res: Response) => {
	res.send(`Hotfix Server :)`)
})

// Game Data
const otwDL = new Set()
r.get("/data_game/:game/:server/*", async (req: Request, res: Response) => {
	const logUser = `${req.ip} | `

	try {
		const p = req.params
		const game = p.game
		const server = p.server
		var url_only = decodeURI(p[0])

		const baseCachePath = `./src/server/web/public/cache/game/${game}`

		/*
		log.warn({
			params: p,
			query: req.query,
			headers: req.headers
		})
		*/

		// Determine base domain
		let domainDL = ""
		if (game === "starrails" && server === "cn") {
			domainDL = `https://autopatchcn.bhsr.com/${url_only}`
			log.warn(logUser + `file ${domainDL} cn version`)
		} else if (game === "starrails") {
			domainDL = `https://autopatchos.starrails.com/${url_only}`
		} else {
			if (url_only.includes("3.2")) {
				domainDL = `https://ps.yuuki.me/data_game/genshin/${url_only}` // old server yuuki
			} else {
				domainDL = `https://autopatchhk.yuanshen.com/${url_only}`
			}
		}

		// Define file paths
		const filePath = join(baseCachePath, url_only)
		const tempFilePath = join(baseCachePath, `${url_only}.temp`)

		// Check if file exists in cache
		const fileExists = await fs
			.access(filePath)
			.then(() => true)
			.catch(() => false)
		if (!fileExists) {
			if (otwDL.has(domainDL)) {
				log.warn(logUser + ` file ${domainDL} not finished downloading yet`)
				return res.redirect(domainDL)
			}

			otwDL.add(domainDL)
			log.warn(logUser + `file not found, download it ${domainDL} and save ${filePath}`)

			// Create directory if it doesn't exist
			await fs.mkdir(dirname(filePath), { recursive: true })

			// if temporary file exists
			const tempFileExists = await fs
				.access(tempFilePath)
				.then(() => true)
				.catch(() => false)
			if (tempFileExists) {
				// remove it, (TODO: if need add lock here)
				log.errorNoStack(logUser + `found tmp file ${domainDL}, remove it`)
				await fs
					.unlink(tempFilePath)
					.then(() => true)
					.catch(() => false)
			}

			// Perform download
			var response
			try {
				response = await axios.get(domainDL, {
					responseType: "arraybuffer",
					timeout: 1000 * 600
				})
			} catch (error) {
				var c = error as AxiosError
				log.errorNoStack(logUser + `Error5 ${c.message} download file ${domainDL}`)
				otwDL.delete(domainDL)
				return res.redirect(domainDL)
			}
			if (response.status != 200) {
				log.errorNoStack(logUser + `Error3 ${response.statusText} download file ${domainDL}`)
				otwDL.delete(domainDL)
				return res.redirect(domainDL)
			}

			// Write to temporary file
			var issave = await fs
				.writeFile(tempFilePath, response.data)
				.then(() => true)
				.catch(() => false)
			if (issave) {
				var isrename = await fs
					.rename(tempFilePath, filePath)
					.then(() => true)
					.catch(() => false)
				if (!isrename) {
					log.errorNoStack(logUser + `Error1 rename file ${domainDL}, isrename: ` + isrename)
					otwDL.delete(domainDL)
					return res.redirect(domainDL)
				}
			} else {
				log.errorNoStack(logUser + `Error2 save file file ${domainDL}, issave: ` + issave)
				otwDL.delete(domainDL)
				return res.redirect(domainDL)
			}

			log.warn(logUser + `file done download it ${domainDL} and save ${filePath}`)
			otwDL.delete(domainDL)
		} else {
			log.warn(logUser + `file local found ${filePath}`)
		}

		// Set response headers
		const fileName = basename(url_only)
		res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)

		// Send file to client
		return res.sendFile(path.resolve(filePath))
	} catch (error) {
		log.errorNoStack(error)
		return res.status(500).send("Error server....")
	}
})

export default r
