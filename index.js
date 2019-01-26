const puppeteer = require('puppeteer')
const CREDS = require('./creds')
const SELECTORS = require('./selectors')
const mongoose = require('mongoose')
require('mongoose-double')(mongoose)
const os = require('os')
const args = []

const SchemaTypes = mongoose.Schema.Types
const Datapoints = require('./models/datapoints')
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))


function insertDataPoint(dataPoint) {
	// Connects to database and adds a document to a collection

	const DB_URL = 'mongodb://server.ryanpoon.com:39898/HSReplayData'
	if (mongoose.connection.readyState == 0) { mongoose.connect(DB_URL, { useNewUrlParser: true }); console.log('Successfully Connected to Database at ' + DB_URL);}
	Datapoints.create(dataPoint)
}

function exportData(archetypes, winrates, popularity, date) {
	// Processes archetypes, winrates, and popularity to create a JSON object to export

	if (archetypes.length > 0) {
		let output = {timestamp: date, decks: []}
		for (let i = 0; i < archetypes.length; i++) {
			output.decks.push({name: archetypes[i], winrate: winrates[i], popularity: popularity[i], screenshot: './screenshots/' + archetypes[i] + '_' + date + '.png'})
		}
		insertDataPoint(output)
	}
}

async function valuesFromSelector(selector, page) {
	// Given any selector and page, will make an array of all values within elements with the selector

	const elements = await page.$$(selector)
	console.log(`for selector ${selector}, found ${elements.length} elements`)
	let values = []
	for (let i = 0; i < elements.length; i++) {
		const e = elements[i]
		values.push(await (await e.getProperty('textContent')).jsonValue())
	}
	return values
}

async function getWinrates(handles, browser, archetypes, date) {
	// Given the handles to deck links, browser, and archetypes will create an array of winrates

	let values = []
	for (let i = 0; i < handles.length; i++) {
		let link = await (await handles[i].getProperty('href')).jsonValue()
		const page = await browser.newPage()
		await page.goto(link + '#rankRange=LEGEND_THROUGH_FIVE', {waitUntil: 'networkidle0'})
		let value = (await valuesFromSelector(SELECTORS.winrate, page))[0]
		value = parseFloat(value.replace('%', ''))
		values.push(value)
		await page.screenshot({path: './screenshots/' + archetypes[i] + '_' + date + '.png', type: 'png'})
		await page.close()
	}

	return values
}

async function getPopularity(page, numArchetypes) {
	// Given the page and number of archetypes, will create an array of weighted averages of popularity

	let popularity = await valuesFromSelector(SELECTORS.popularity, page)
	let gamesPlayed = await valuesFromSelector(SELECTORS.gamesPlayed, page)
	let values = []
	for (let i = 0; i < numArchetypes; i++) {
		let nums = 0.0
		let totalGames = 0.0
		for (let k = 0; k < 6; k++) {
			let num = parseFloat(popularity[i * 7 + k].replace('%', ''))/100
			console.log(num)
			let num1 = parseFloat(gamesPlayed[k].replace(',', ''))
			nums += num1*num
			totalGames += num1
		}
		values.push(parseFloat(((nums/totalGames) * 100.0).toFixed(2)))
	}
	return values

}

if (os.platform() == 'linux') {
	args.push('--no-sandbox')
	args.push('--disable-setuid-sandbox')
	args.push('--disable-gpu')

}

void (async () => {

	// Setting the number of tries alloted to find the data
	let tries = 10

	// Creating a Chromium browser through puppeteer
	const browser = await puppeteer.launch({args: args, headless: false})

	// Repeats until no more tries remaining
	while (tries-- > 0) {
	try {
		// Marks the timestamp and creates a new page
		const now = Date.now()
		const page = await browser.newPage()

		// Navigates to HSreplay login
		await page.goto('https://hsreplay.net/account/login/?next=%2F', {waitUntil: 'networkidle0'})
		
		// Makes sure you aren't already logged in
		if (await page.url() == 'https://hsreplay.net/account/login/?next=%2F') {

		// Clicking a button to navigate to Blizzard
			await page.click('body > div.container > div > form > p:nth-child(2) > button')
			await page.waitForNavigation({waitUntil: 'networkidle0'})
			
			// Fills out login credentials for Blizzard
			await page.click(SELECTORS.emailField)
			await timeout(100)
			await page.keyboard.type(CREDS.email)
			
			await page.click(SELECTORS.passwordField)
			await timeout(100)
			await page.keyboard.type(CREDS.password)
			
			// Submits login credentials to Blizzard
			await timeout(100)
			await page.click(SELECTORS.blizzardLogin)
			await page.waitForNavigation({waitUntil: 'networkidle0'})
		}
		// Navigate to popularity table
		await page.goto('https://hsreplay.net/meta/#tab=popularity&popularitySortBy=rank0', {waitUntil: 'networkidle0'})
		await timeout(3000)

		// Collect data from the website
		let archetypes = await valuesFromSelector(SELECTORS.archetypes, page)
		let archetypeElements = await page.$$(SELECTORS.archetypeLinks)
		let winrates = await getWinrates(archetypeElements, browser, archetypes, now)
		let popularity = await getPopularity(page, archetypes.length)
		console.log(archetypes)
		console.log(popularity)
		console.log(winrates)
		
		// Export the data
		exportData(archetypes, winrates, popularity, now)
		console.log(archetypes.length.toString() + " archetypes exported")
		await timeout(5000)
		
		break
		
		} catch (error) {
			console.log("ERROR")
			console.dir(error)
			if (error.name == 'TimeoutError') {
				console.log("TIMEOUT, will try again...")
			}
		}
	}
	await browser.close()
})()