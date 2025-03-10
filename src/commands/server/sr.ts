import Logger from "@UT/logger"
import { Command } from "./Interface"
import fs from "fs/promises"
import { extractMD5, forceDownload, getMD5HashFile, loadCache, saveCache } from "@UT/library"
import axios, { AxiosError } from "axios"
import { BlockV, EndianBinaryReader } from "@UT/AsbDataReader"
import { DesignIndex } from "@UT/DesignIndex"
import { LuaIndex } from "@UT/LuaIndex"

const log = new Logger("/gi", "blue")

interface M_ArchiveV {
	MajorVersion: number
	MinorVersion: number
	PatchVersion: number
	PrevPatch: number
	ContentHash: string
	FileSize: number
	TimeStamp: number
	FileName: string
	BaseAssetsDownloadUrl: string
}

export default async function handle(command: Command) {
	const folderDownload = `./src/server/web/public/cache/game/starrails`
	const mainUrl = "https://autopatchos.starrails.com"
	// sort old to new
	const list = {
		"V3.1Live": [
			{
				//  2/26/2025 6:32 AM
				lua: { Version: 9541775, Suffix: "08e8af7801b1" }, // new
				design: { Version: 9547765, Suffix: "713057990b1d" }, // new
				asb: { Version: 9541591, Suffix: "bcf453d9fdcc" }, // new
				ifix: { Version: 0, Suffix: "63f56c3a23df" }
			},
			{
				//  2/26/2025 10:47 PM
				lua: { Version: 9593433, Suffix: "7564031acba9" },
				design: { Version: 9593657, Suffix: "e16284d5ef18" }, // new
				asb: { Version: 9593433, Suffix: "23cb40d35d81" },
				ifix: { Version: 0, Suffix: "63f56c3a23df" } // new
			},
			{
				//  2/27/2025 10:42 PM (1)
				lua: { Version: 9593433, Suffix: "7564031acba9" }, // new
				design: { Version: 9609435, Suffix: "0279774025a8" }, // new
				asb: { Version: 9593433, Suffix: "23cb40d35d81" },
				ifix: { Version: 9609435, Suffix: "6ed706857502" }
			},
			{
				//  2/27/2025 10:42 PM (2)
				lua: { Version: 9609017, Suffix: "db6782cb6494" }, // new
				design: { Version: 9609435, Suffix: "0279774025a8" },
				asb: { Version: 9593433, Suffix: "23cb40d35d81" },
				ifix: { Version: 9609435, Suffix: "6ed706857502" }
			},
			{
				// 2/28/2025 8:14 PM (1)
				lua: { Version: 9609017, Suffix: "db6782cb6494" }, // new
				design: { Version: 9619913, Suffix: "d28c8c251102" },
				asb: { Version: 9593433, Suffix: "23cb40d35d81" },
				ifix: { Version: 9609435, Suffix: "6ed706857502" }
			},
			{
				// 2/28/2025 8:14 PM (2)
				lua: { Version: 9619913, Suffix: "f7fb364d2fe3" },
				design: { Version: 9619913, Suffix: "d28c8c251102" }, // new
				asb: { Version: 9593433, Suffix: "23cb40d35d81" }, // new
				ifix: { Version: 9609435, Suffix: "6ed706857502" } // new
			},
			{
				// 3/5/2025 4:23 PM
				lua: { Version: 9619913, Suffix: "f7fb364d2fe3" },
				design: { Version: 9646575, Suffix: "f2ffc71bfd3c" }, // new
				asb: { Version: 9646899, Suffix: "dc5a5d311c68" },
				ifix: { Version: 9648222, Suffix: "20fe9ae9c672" }
			},
			{
				// 3/6/2025 2:52 PM
				lua: { Version: 9619913, Suffix: "f7fb364d2fe3" },
				design: { Version: 9662569, Suffix: "e0dbb645a641" },
				asb: { Version: 9646899, Suffix: "dc5a5d311c68" },
				ifix: { Version: 9648222, Suffix: "20fe9ae9c672" }
			}
		]
		/*
		"V3.0Live": [
			{
				design: { Version: 9426195, Suffix: "31633e67fc5b" }
			},
			{
				asb: { Version: 9341358, Suffix: "d0c774f35be6" },
				design: { Version: 9355287, Suffix: "7427e93fd0f0" },
				lua: { Version: 9342153, Suffix: "d83b3bb34d87" },
				ifix: { Version: 9350557, Suffix: "b452022dcada" }
			}
		]*/
	}
	const clients = ["Android", "Windows", "iOS"]

	// list version
	for (const [version, versionDatas] of Object.entries(list)) {
		// Cache Folder
		const CACHE_FILE = `${folderDownload}/md5/${version}.json`
		const cache = await loadCache(CACHE_FILE)
		// list data suffix version
		for (const versionData of versionDatas) {
			// list client data
			for (const os of clients) {
				log.info(`Downloading ${version} for ${os}`)

				var urlAsbVersion = `${mainUrl}/asb/${version}/output_${versionData.asb.Version}_${versionData.asb.Suffix}/client/${os}`
				var urlDesignVersion = `${mainUrl}/design_data/${version}/output_${versionData.design.Version}_${versionData.design.Suffix}/client/${os}`
				var urlLuaVersion = `${mainUrl}/lua/${version}/output_${versionData.lua.Version}_${versionData.lua.Suffix}/client/${os}`

				var asbLinks: string[] = []
				var luaLinks: string[] = []
				var exResourceLinks: string[] = []

				// Parse Asb Data use ArchiveV.bytes
				var urlAsb = `${urlAsbVersion}/Archive/M_ArchiveV.bytes`
				var baseAssetsDownloadUrl = ""
				try {
					log.info(`Parse asb data ${urlAsb}`)
					const rsp1 = await axios.get(urlAsb)
					var asbData = rsp1.data
						.split("\n")
						.filter((line: string) => line.trim() !== "")
						.map((line: string) => JSON.parse(line)) as M_ArchiveV[]
					asbLinks.push(urlAsb)

					// download archive data aka Block
					for (const archiveData of asbData) {
						if (!archiveData.FileName.includes("M_BlockV")) {
							//log.warn(`Skip ${archiveData.FileName}`)
							continue
						}
						if (archiveData.BaseAssetsDownloadUrl != "") {
							baseAssetsDownloadUrl = archiveData.BaseAssetsDownloadUrl
						}
						const urlBlockV = `${urlAsbVersion}/Block/BlockV_${archiveData.ContentHash}.bytes`
						try {
							log.info(`Parse block data ${urlBlockV}`)
							const rsp1 = await axios.get(urlBlockV, { responseType: "arraybuffer" })
							const blockV = new BlockV()
							blockV.readData(rsp1.data, true, false)
							asbLinks.push(urlBlockV)
							for (const block of blockV.asbBlocks) {
								var linktoAdd = ""
								if (block.isStart || baseAssetsDownloadUrl == "") {
									linktoAdd = `${urlAsbVersion}/Block/${block.assetName}.block`
								} else {
									linktoAdd = `${mainUrl}/asb/${version}/${baseAssetsDownloadUrl}/client/${os}/Block/${block.assetName}.block`
								}
								asbLinks.push(linktoAdd)
							}
						} catch (error) {
							const axiosError = error as AxiosError
							log.errorNoStack(`Error parsing block data: ${urlBlockV}`, axiosError.message)
						}
					}
				} catch (error) {
					const axiosError = error as AxiosError
					log.errorNoStack(`Error parsing ASB data: ${urlAsb}`, axiosError.message)
				}

				// Parse Design Data
				var urlDesign = `${urlDesignVersion}/M_DesignV.bytes`
				try {
					log.info(`Parse design data ${urlDesign}`)

					// Fetch the design file as an ArrayBuffer.
					const rsp2 = await axios.get(urlDesign, { responseType: "arraybuffer" })
					const reader = new EndianBinaryReader(rsp2.data, false, false)

					// Read the header fields, matching the C# code:
					// Read the magic string (first 4 characters)
					const magic = reader.readChars(4)

					// Read an Int16 (skipped value)
					reader.readInt16()

					// Read MetadataInfoSize as a 32-bit integer (little-endian)
					const MetadataInfoSize = reader.readInt32LE()

					// Skip 0xE (14) bytes.
					reader.offset += 0xe

					// Read RemoteRevisionID as a 32-bit integer (little-endian)
					const RemoteRevisionID = reader.readInt32LE()

					// Read IndexHash (16 bytes, with per-chunk reversal)
					const IndexHash = reader.readHash()

					// Read AssetListFilesize as a 32-bit unsigned integer (little-endian)
					const AssetListFilesize = reader.buffer.readUInt32LE(reader.offset)
					reader.offset += 4

					// Skip the next 4 bytes.
					reader.offset += 4

					// Read AssetListUnixTimestamp as a 64-bit unsigned integer (little-endian)
					const AssetListUnixTimestamp = reader.buffer.readBigUInt64LE(reader.offset)
					reader.offset += 8

					// Read AssetListRootPath as a string (length-prefixed)
					const AssetListRootPath = reader.readString()

					// Build json for debug
					log.info(`M_DesignV`, {
						magic,
						MetadataInfoSize,
						RemoteRevisionID,
						IndexHash,
						AssetListFilesize,
						AssetListUnixTimestamp,
						AssetListRootPath
					})

					const indexHashUrl = `${urlDesignVersion}/DesignV_${IndexHash}.bytes`
					exResourceLinks.push(indexHashUrl)

					// Fetch design index.
					const response = await axios.get(indexHashUrl, { responseType: "arraybuffer" })
					const indexBytes = Buffer.from(response.data)
					const designIndex = DesignIndex.read(indexBytes)
					for (const file of designIndex.Files) {
						exResourceLinks.push(`${urlDesignVersion}/${file.FileHash}.bytes`)
					}

					//console.info(`Parsed design index: ${filesNum} files with ${entriesNum} total entries.`)
				} catch (error) {
					const axiosError = error as AxiosError
					log.errorNoStack(`Error parsing design data: ${urlDesign}`, axiosError.message)
				}

				// Parse Lua Data
				const urlLua = `${urlLuaVersion}/M_LuaV.bytes`
				try {
					log.info(`Parse M_LuaV data ${urlLua}`)
					const rsp3 = await axios.get(urlLua, { responseType: "arraybuffer" })

					// Create a reader for the LuaV file.
					const br = new EndianBinaryReader(rsp3.data, false, false)
					luaLinks.push(urlLua)

					// Read header fields.
					// Read magic string (first 4 characters).
					const magic = br.readChars(4)
					// Skip a 16-bit value.
					br.readInt16()
					// Read MetadataInfoSize (32-bit little-endian).
					const MetadataInfoSize = br.readInt32LE()
					// Skip 0xE (14) bytes.
					br.offset += 0xe
					// Read RemoteRevisionID (32-bit little-endian).
					const RemoteRevisionID = br.readInt32LE()
					// Read IndexHash (16 bytes with per‑chunk reversal).
					const IndexHash = br.readHash()
					// Read AssetListFilesize (32-bit unsigned little-endian) and skip next 4 bytes.
					const AssetListFilesize = br.buffer.readUInt32LE(br.offset)
					br.offset += 4
					br.offset += 4
					// Read AssetListUnixTimestamp (64-bit unsigned little-endian).
					const AssetListUnixTimestamp = br.buffer.readBigUInt64LE(br.offset)
					br.offset += 8
					// Read AssetListRootPath (using a 7‑bit encoded length prefix).
					const AssetListRootPath = br.readString()

					// Build json for debug
					log.info(`M_LuaV`, {
						magic,
						MetadataInfoSize,
						RemoteRevisionID,
						IndexHash,
						AssetListFilesize,
						AssetListUnixTimestamp,
						AssetListRootPath
					})

					// Build the index URL using the IndexHash.
					const indexHashUrl = `${urlLuaVersion}/LuaV_${IndexHash}.bytes`
					luaLinks.push(indexHashUrl)

					// Parsing of the Lua Index File
					const indexRsp = await axios.get(indexHashUrl, { responseType: "arraybuffer" })
					const indexReader = LuaIndex.read(indexRsp.data)
					for (const file of indexReader.Files) {
						luaLinks.push(`${urlLuaVersion}/${file.FileHash}.bytes`)
					}
				} catch (error) {
					const axiosError = error as AxiosError
					log.errorNoStack(`Error parsing lua data: ${urlDesign}`, axiosError.message)
				}

				// TODO HERE
				log.info(
					`ASB Links: ${asbLinks.length}, Design Links: ${exResourceLinks.length}, Lua Links: ${luaLinks.length}`
				)

				const linksFile = `${folderDownload}/links/${version}/${os}.json`
				const allLinks = { asbLinks, luaLinks, exResourceLinks }
				await fs.mkdir(`${folderDownload}/links/${version}`, { recursive: true })
				await fs.writeFile(linksFile, JSON.stringify(allLinks, null, 2), "utf-8")

				log.info(`Saved links to ${linksFile}`)

				const DLlink = asbLinks.concat(luaLinks, exResourceLinks)
				for (const link of DLlink) {
					// Check if URL is cached aka done downloading
					if (cache[link]) {
						if (cache[link] == "") {
							log.info(`Ignore files that are always checked > ${link}`)
						} else {
							log.info(`Skipping: ${link} (Cached 2)`)
							continue
						}
					}

					var saveTo = `${folderDownload}${link.replace(mainUrl, "")}`
					var expectedMd5 = extractMD5(link) ?? ""
					const isValid = await getMD5HashFile(saveTo, expectedMd5)
					if (expectedMd5 != "") {
						if (isValid) {
							cache[link] = expectedMd5
							await saveCache(CACHE_FILE, cache)
							log.info(`Skip ${link} because already downloaded and valid`)
							continue
						}
						log.warn(`MD5 mismatch > ${saveTo} > try download ${link}`)
					} else {
						log.info(`Keep download > ${link} > ${saveTo}`)
					}

					var isSave = await forceDownload(link, saveTo)
					if (isSave == 0) {
						if (expectedMd5 != "") {
							const isValid2 = await getMD5HashFile(saveTo, expectedMd5)
							if (isValid2) {
								log.info(`Download done and vaild > ${saveTo}`)
								cache[link] = expectedMd5
								await saveCache(CACHE_FILE, cache)
							} else {
								log.errorNoStack(`Download done but not vaild > ${saveTo}`)
							}
						} else {
							log.info(`Download done without md5 > ${saveTo}`)
						}
					} else {
						log.errorNoStack(`Download failed > ${saveTo}`)
						if (isSave == -1) {
							cache[link] = "not_found"
							await saveCache(CACHE_FILE, cache)
						}
					}
				}

				asbLinks = []
				luaLinks = []
				exResourceLinks = []
			}
		}
	}

	log.info("Done ^_^")
}
