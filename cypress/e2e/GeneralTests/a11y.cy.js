import 'cypress-axe'
const dayjs = require('dayjs')

const pageName = 'home'

// includedImpacts values: "minor", "moderate", "serious", or "critical"

describe('Accessibility audit', () => {
    beforeEach(function () {
        // cy.viewport(414, 896) // for mobile, adjust the viewport if needed

        Cypress.on("uncaught:exception", () => false)

        cy.visit(Cypress.config('baseUrl'))
        cy.contains(/./).wait(5000).pause() // wait for the page content to load up
        cy.injectAxe() // required
    })

    it('Exports a11y violations using writeFile with timestamp', () => {
        const now = dayjs()
        const formattedDate = now.format('mmDDMMYY')
        cy.log('Formatted Date: ' + formattedDate)

        cy.checkA11y(null, {
            includedImpacts: ['critical', 'serious', 'moderate'] // modify this according to requirement
        }, (violations = []) => {
            const report = {
                timestamp: new Date().toISOString(),
                violations
            }

            const filename = `cypress/downloads/${pageName}-a11yReport-${formattedDate}.json`
            cy.writeFile(filename, report)
        })
    })
})

// Generates generic accessibility audit on a single page
// Generates a json file even when the test fails