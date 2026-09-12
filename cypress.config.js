const { defineConfig } = require("cypress")
const fs = require("fs")
const pdf = require("pdf-parse")
const path = require("path")

module.exports = defineConfig({
  projectId: "grm21s",
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 10,
  e2e: {
    async setupNodeEvents(on, config) {
      console.log(`Base URL: ${config.baseUrl}`)

      // DO NOT DELETE THIS - This is needed to handle PDFs
      on('task', {
        readPdf(pdfPath) {
          return new Promise((resolve) => {
            const filePath = path.resolve(pdfPath)
            const dataBuffer = fs.readFileSync(filePath)
            pdf(dataBuffer).then(function (data) {
              resolve(data)
            })
          })
        },
        findFileContaining({ directory, keyword }) {
          return new Promise((resolve, reject) => {
            try {
              const files = fs.readdirSync(directory) // Read files in the directory
              const matchedFile = files.find(file => file.includes(keyword)) // Search for the keyword
              resolve(matchedFile ? path.join(directory, matchedFile) : null) // Return the path
            } catch (error) {
              reject(new Error(error))
            }
          })
        },
        deleteDownloads() {
          if (fs.existsSync(config.downloadsFolder)) {
            fs.readdirSync(config.downloadsFolder) // gets the files in the folder
              .forEach((file) => {
                fs.unlinkSync(path.join(config.downloadsFolder, file)) // delete
              })
          }
          return null
        },
        parsePDF_NotDownloadedYet({ filePath }) {
          return new Promise((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
              if (err) reject(err);
              pdf(data).then(resolve).catch(reject)
            })
          })
        }
      })

      return config
    },
    specPattern: "cypress/e2e/**/*.{js,jsx,ts,tsx,feature}",
    baseUrl: process.env.CYPRESS_baseUrl || "https://example.cypress.io",
    video: false,
    videoTimeout: 60000,
    viewportWidth: 1920,
    viewportHeight: 1080,
    defaultCommandTimeout: 30000,
    pageLoadTimeout: 90000,
    retries: {
      runMode: 1,
      openMode: 0,
    },
    experimentalRunAllSpecs: true,
    experimentalMemoryManagement: true,
    numTestsKeptInMemory: 10,
    experimentalOriginDependencies: true
  },
  screenshotOnRunFailure: false,
})