import React from 'react';

const PALETTES = [
	{ bg: '#0B233B', blobs: ['#4f46e5', '#7c3aed', '#1d4ed8', '#0f766e'] },
	{ bg: '#0B233B', blobs: ['#9333ea', '#2563eb', '#0891b2', '#db2777'] },
	{ bg: '#0B233B', blobs: ['#16a34a', '#0d9488', '#059669', '#65a30d'] },
	{ bg: '#0B233B', blobs: ['#ea580c', '#dc2626', '#d97706', '#e11d48'] },
	{ bg: '#0B233B', blobs: ['#db2777', '#c026d3', '#7c3aed', '#ea580c'] },
];

// Mulberry32 seeded from bot id — deterministic, cheap
function makeRng(id) {
	const str = String(id);
	let s = 0;
	for (let i = 0; i < str.length; i++) s = (Math.imul(31, s) + str.charCodeAt(i)) | 0;
	s = s >>> 0;
	return () => {
		s += 0x6d2b79f5;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function lerp(a, b, t) { return a + (b - a) * t; }

function generateBotStyle(id, paletteIndex) {
	const rng = makeRng(id);
	const palette = PALETTES[paletteIndex % PALETTES.length];

	const blobs = [
		[22, 32], [17, 26], [16, 25], [12, 20],
	].map(([minR, maxR]) => {
		const r = Math.round(lerp(minR, maxR, rng()));
		// Independent x/y durations make motion organic rather than diagonal
		const durX = lerp(5, 11, rng()).toFixed(1);
		const durY = lerp(5, 11, rng()).toFixed(1);
		const xs = Array.from({ length: 4 }, () => Math.round(lerp(18, 82, rng())));
		const ys = Array.from({ length: 4 }, () => Math.round(lerp(18, 82, rng())));
		return {
			r,
			durX,
			durY,
			cx: [...xs, xs[0]].join(';'),
			cy: [...ys, ys[0]].join(';'),
		};
	});

	return { palette, blobs };
}

const KS = '0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1';

export function BotAvatar({ id, paletteIndex }) {
	const uid = `bot-${id}`;
	const { palette, blobs } = generateBotStyle(id, paletteIndex);

	return (
		<svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
			<defs>
				<filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="12"/>
				</filter>
				<clipPath id={`${uid}-clip`}>
					<circle cx="50" cy="50" r="49"/>
				</clipPath>
			</defs>

			<g clipPath={`url(#${uid}-clip)`}>
				<circle cx="50" cy="50" r="50" fill={palette.bg}/>
				<g filter={`url(#${uid}-glow)`}>
					{blobs.map((b, i) => (
						<circle key={i} r={b.r} fill={palette.blobs[i]}>
							<animate attributeName="cx" values={b.cx} dur={`${b.durX}s`}
								repeatCount="indefinite" calcMode="spline" keySplines={KS}/>
							<animate attributeName="cy" values={b.cy} dur={`${b.durY}s`}
								repeatCount="indefinite" calcMode="spline" keySplines={KS}/>
						</circle>
					))}
				</g>
			</g>
		</svg>
	);
}
