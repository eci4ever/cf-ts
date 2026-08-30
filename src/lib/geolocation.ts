export function getPosition(): Promise<{
	latitude: number;
	longitude: number;
}> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error("Geolocation is not supported by this browser"));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				}),
			(error) => reject(new Error(error.message || "Failed to get location")),
			{ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
		);
	});
}
