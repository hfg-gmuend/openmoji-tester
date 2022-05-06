import * as cheerio from 'cheerio';

export default function getSvgWithOutline(svgString, options = {}){
	/* Options */
	const outlineColor = options.color || '#FFF';
	const outlineAddedThickness = options.addedStrokeWidth ?? 4;
	const closeFilledPaths = options.closeFilledPaths ?? true;
	const backgroundLayerName = options.backgroundLayerName || 'outline';

	/* Load SVG */	
	const $ = cheerio.load(svgString);

	/* Copy content and adjust */
	let svg = $('svg').first();
	const contentCopy = svg.children().clone();
	const bgLayerRef = '#' + backgroundLayerName
	svg.prepend('<g id="' + backgroundLayerName + '"></g>')
	$(bgLayerRef).first().append(contentCopy)
	$(bgLayerRef + ' #grid').remove() // Remove grid as we don't want to outline the grid
	$(bgLayerRef + ' *').removeAttr('id') // Remove IDs because otherwise they would appear twice in SVG

	/* Outline */
	const selectors = [
		bgLayerRef + ' path',
		bgLayerRef + ' rect',
		bgLayerRef + ' line',
		bgLayerRef + ' circle',
		bgLayerRef + ' ellipse',
		bgLayerRef + ' polyline',
		bgLayerRef + ' polygon',
	]

	const svgShapes = $( selectors.join(', ') )
	svgShapes.each(function(index, element) {
		adjustElementIfNeeded($, element, outlineColor, outlineAddedThickness, closeFilledPaths)
	});

	/* Remove unneeded layers for viewing */
	$('#grid').remove()

	/* Convert back to SVG string */
	const htmlString = $.html()
	const svgOnlyString = htmlString.replace('<html><head></head><body>', '').replace('</body></html>', '') // Remove the added HTML from Cheerio as we don't have HTML
	return svgOnlyString
}

function adjustElementIfNeeded($, element, outlineColor, outlineAddedThickness, closeFilledPaths){
	var elementFill = $(element).attr('fill');
	var elementStroke = $(element).attr('stroke');
	var hasFill = elementFill && elementFill != 'none'
	var hasStroke = elementStroke && elementStroke != 'none'
	var strokeWidth = $(element).attr('stroke-width') || 0;
	var newStrokeThickness = Math.max(2, strokeWidth) + outlineAddedThickness

	if(hasFill){
		$(element).attr('fill', outlineColor);
		$(element).attr('stroke', outlineColor);
		$(element).attr('stroke-width', newStrokeThickness);
		$(element).attr('stroke-linecap', 'round');
		$(element).attr('stroke-linejoin', 'round');

		if(closeFilledPaths === true && element.name === 'path'){
			var pointsString = $(element).attr('d');
			var lastCharacter = pointsString.slice(-1)
			// Z is the command in a path to close it -> looks better for certain emojis, e.g. 1F467-1F3FD
			if(lastCharacter.toUpperCase() !== 'Z'){
				pointsString = pointsString + 'Z'
				$(element).attr('d', pointsString);
			}
		}
	}
	if(hasStroke){
		$(element).attr('stroke', outlineColor);
		$(element).attr('stroke-width', newStrokeThickness);
		$(element).attr('stroke-linecap', 'round');
		$(element).attr('stroke-linejoin', 'round');
	}

	if(!hasFill && !hasStroke){
		// -> I think that is a default that if neither is set it is filled #000
		$(element).attr('fill', outlineColor);
		$(element).attr('stroke', outlineColor);
		$(element).attr('stroke-width', newStrokeThickness);
	}
}