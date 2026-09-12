//const baseURL = 'https://themostdangerousgames.com'
const baseURL = Cypress.config('baseUrl')
const includeExternalLinks = Cypress.env('INCLUDE_EXTERNAL_LINKS') ?? false // toggle to include/exclude external links for the crawler in the first test

let passedURLs = []
let brokenURLs = []
let pages = []
let externalURLs = []
let pagesDetails = []

const username = Cypress.env('AUTH_USERNAME')
const password = Cypress.env('AUTH_PASSWORD') 
const isAuthenticationRequired = Cypress.env('AUTH_REQUIRED') ?? false // set to false for sites without the basic authentication

// cheerio is used to parse HTML server-side from cy.request responses without rendering a browser DOM, which makes the run much faster.
// The load() method creates a jQuery-like interface for querying elements safely and consistently.

import { load } from 'cheerio'

function getAuthOptions() {
    if (!isAuthenticationRequired) {
        return {}
    }

    if (!username || !password) {
        throw new Error('AUTH_REQUIRED=true but AUTH_USERNAME/AUTH_PASSWORD are not set')
    }

    return {
        auth: {
            username: username,
            password: password
        }
    }
}

const auditPage = (page, pageDetail) => {
    return cy.request({
        url: page,
        failOnStatusCode: false,
        timeout: 60000,
        ...getAuthOptions()
    }).then((response) => {
        if (response.status >= 400) {
            // Skip auditing if page is broken
            return
        }
        const loadResponseBody = load(response.body)
        const title = loadResponseBody('title').text()?.trim() // WCAG 2.1 Criterion: 2.4.2 Page Titled (Level A) 
        const htmlLang = loadResponseBody('html').attr('lang') // WCAG 2.1 Criterion: 3.1.1 Language of Page (Level A)
        const favicon = loadResponseBody('link[rel*="icon"]').length > 0 // there are sites that doesnt use tgus, but just fetches the /favicon.ico in the root html

        const metaCharset = loadResponseBody('meta[charset="UTF-8"]').length > 0 // WCAG 2.1 Criterion: 4.1.1 Parsing (Level A)
        const metaResponsiveness = loadResponseBody('meta[name="viewport"]').length > 0 // 1.4.4 Resize text (Level AA) & 1.4.12 Text Spacing (Level AA)
        const metaDescription = loadResponseBody('meta[name="description"]')
        const metaRobots = loadResponseBody('meta[name="robots"]')
        const metaOGURL = loadResponseBody('[property="og:url"]')
        const metaOGTitle = loadResponseBody('[property="og:title"]')
        const metaOGDescription = loadResponseBody('[property="og:description"]')
        const metaOGImage = loadResponseBody('[property="og:image"]')
        const metaTwitter = loadResponseBody('meta[name*="twitter"]')

        const a11y_mainLandmark = loadResponseBody('main').length > 0 // WCAG 2.1 Criterion: 2.4.1 Bypass Blocks (Level A)
        const a11y_head = loadResponseBody('head').length > 0 // WCAG 2.1 Criterion: 4.1.1 Parsing (Level A)
        const a11y_body = loadResponseBody('body').length > 0 // WCAG 2.1 Criterion: 4.1.1 Parsing (Level A)
        const a11y_h1 = loadResponseBody('h1').length > 0 // WCAG 2.1 Criterion: 2.4.6 Headings and Labels (Level AA)

        const a11y_images = loadResponseBody('img') //  WCAG 2.1 Criterion: 1.1.1: Non-text Content (Level A)
        const allIds = loadResponseBody('[id]').map((_, el) => loadResponseBody(el).attr('id')).get()
        const duplicateIds = allIds.filter((id, idx, arr) => arr.indexOf(id) !== idx)

        pageDetail.validations.hasTitle = Boolean(title)
        pageDetail.validations.hasFavicon = favicon
        pageDetail.validations.hasLangAttr = Boolean(htmlLang)

        pageDetail.validations.hasMetaDescriptionContent = Boolean(metaDescription.attr('content')?.trim())
        pageDetail.validations.hasMetaRobotsContent = Boolean(metaRobots.attr('content')?.trim())
        pageDetail.validations.hasMetaOGTitleContent = Boolean(metaOGTitle.attr('content')?.trim())
        pageDetail.validations.hasMetaOGDescriptionContent = Boolean(metaOGDescription.attr('content')?.trim())
        pageDetail.validations.hasMetaOGURLContent = Boolean(metaOGURL.attr('content')?.trim())
        pageDetail.validations.hasMetaOGImageContent = Boolean(metaOGImage.attr('content')?.trim())
        pageDetail.validations.hasMetaTwitterContent = Boolean(metaTwitter.attr('content')?.trim())

        pageDetail.validations.hasMetaCharset = metaCharset
        pageDetail.validations.hasMetaResponsiveness = metaResponsiveness

        pageDetail.validations.a11y_hasMainLandMark = a11y_mainLandmark
        pageDetail.validations.a11y_hasHead = a11y_head
        pageDetail.validations.a11y_hasBody = a11y_body
        pageDetail.validations.a11y_imagesHaveAlt = a11y_images.length === 0 || a11y_images.toArray().every(img => loadResponseBody(img).attr('alt') && loadResponseBody(img).attr('alt').trim() !== '') // passes if theres no img
        pageDetail.validations.a11y_hasNoDuplicateIDs = duplicateIds.length === 0
        pageDetail.validations.duplicateIDs = [...new Set(duplicateIds)] // show only one instance of duplicated element
        pageDetail.validations.a11y_hasH1 = a11y_h1  // WCAG 2.1 Criterion: 2.4.6 Headings and Labels (Level AA)

        pagesDetails.push(pageDetail)
    })
}

describe('Website Crawler & Blind testing', () => {
    beforeEach(function () {
        Cypress.on("uncaught:exception", () => false)

        cy.contains(/./).wait(5000) // wait for the page content to load up

        cy.visit(baseURL, {
            timeout: 60000,
            ...getAuthOptions()
        })

    })

    it('Website Crawler; Identify broken links', () => {
        // match both <a> and dynamic data-href cases (like slide cards)
        cy.get('a, [data-href]')
            .then((links) => {
                const uniquePages = new Set() // Use Set to avoid duplicates

                links.each((_, el) => {
                    let href = el.getAttribute('href')
                    if (!href) {
                        href = el.getAttribute('data-href')
                    }

                    cy.log('href: ' + href)

                    if (!href || typeof href !== 'string') return // skip null or non-string hrefs
                    if (href.startsWith('#') || href.startsWith('javascript') || href.includes('mailto:') || href.includes('.xml')) return // skip anchors, js links, mailto, and xml

                    const absoluteUrl = new URL(href, baseURL).href // set the URL to absolute URL in case the URL is relative
                    uniquePages.add(absoluteUrl) // "Add" to Set to ensure uniqueness
                })

                pages = Array.from(uniquePages)
            }).then(() => { // logging to the array happens here
                cy.log(`Found ${pages.length} pages`)
                return cy.wrap(pages)
                    .each((page) => {
                        return cy.request({
                            url: page,
                            failOnStatusCode: false,
                            timeout: 60000,
                            ...getAuthOptions()
                        }).then((response) => {
                            if (includeExternalLinks) {
                                if (response.status >= 400) {
                                    brokenURLs.push(`${page} (Status: ${response.status})`)
                                    return
                                } else {
                                    return passedURLs.push(page)
                                }
                            } else {
                                if (page.includes(baseURL)) {
                                    if (response.status >= 400) {
                                        brokenURLs.push(`${page} (Status: ${response.status})`)
                                        return
                                    } else {
                                        return passedURLs.push(page)
                                    }
                                }
                            }
                        }).then(() => {
                            if (!page.includes(baseURL)) {
                                return externalURLs.push(page)
                            } // collect all external URLs regardless of the value of includeExternalLinks
                        })
                    })
            }).then(() => {
                cy.log('Passed URLs count: ' + passedURLs.length)
                cy.log('Passed URLs: ' + passedURLs)
                cy.log('Broken URLs count: ' + brokenURLs.length)
                cy.log('Broken URLs: ' + brokenURLs)
                cy.log('External URLs: count ' + externalURLs.length)
                cy.log('External URLs: ' + externalURLs)

                let totalInternalLinksCollected

                if (includeExternalLinks) {
                    totalInternalLinksCollected = pages.length
                } else {
                    totalInternalLinksCollected = passedURLs.length + brokenURLs.length
                }

                cy.writeFile('cypress/downloads/siteMap.json', {
                    timestamp: new Date().toISOString(),
                    baseURL,
                    totalLinksCollected: pages.length,
                    //totalInternalLinksCollected: pages.length - externalURLs.length,
                    totalInternalLinksCollected: totalInternalLinksCollected,
                    passedURLs,
                    brokenURLs,
                    externalURLs
                })
            })
    })

    it('Blind Testing: Structural, Meta, Accessibility checks', () => {
        cy.get('a, [data-href]')
            .then((links) => {
                const uniquePages = new Set()

                links.each((_, el) => {
                    let href = el.getAttribute('href')
                    if (!href) {
                        href = el.getAttribute('data-href')
                    }

                    if (!href || href.startsWith('#') || href.startsWith('javascript') || href.includes('mailto:') || href.includes('.xml') || href.includes('account')) return
                    // add exclusions here for cross-origin issues ^^
                    const absoluteUrl = new URL(href, baseURL).href
                    uniquePages.add(absoluteUrl)
                })

                pages = Array.from(uniquePages)
            }).then(() => {
                cy.log(`Found ${pages.length} pages`)
                return cy.wrap(pages)
                    .each((page) => {
                        return cy.request({
                            url: page,
                            failOnStatusCode: false,
                            timeout: 60000,
                            ...getAuthOptions()
                        }).then((response) => {
                            const isInternal = page.includes(baseURL)
                            const pageDetail = {
                                url: page,
                                status: response.status,
                                validations: {
                                }
                            }

                            if (!isInternal) {
                                return
                            } // exclude external links

                            return auditPage(page, pageDetail)
                        })
                    })
            }).then(() => {
                cy.writeFile('cypress/downloads/blindTestResult.json', {
                    timestamp: new Date().toISOString(),
                    baseURL,
                    totalLinksCollected: pagesDetails.length, // pageDetails array
                    pages: pagesDetails
                })
            })
    })
})
// Website Crawler (link check)
// - walk homepage links (now also supports data-href cards)
// - detect broken vs working URLs
// - collect internal+external pages in separate buckets
// - avoid duplicates and ignore anchors/mailto/js/xml noise
// - save output in cypress/downloads/siteMap.json

// Blind Testing (page-level checks)
// - fetch each collected page with cy.request (no heavy DOM rendering)
// - evaluate semantic/static metadata and basic accessibility hints
// - store successful results in cypress/downloads/blindTestResult.json