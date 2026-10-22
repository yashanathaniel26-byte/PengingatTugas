export default {
    async fetch(request) {
        const url = new URL(request.url).searchParams.get("url");

        if (!url) return new Response("Missing url param", { status: 400 });

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/calendar, text/plain, */*"
            }
        });

        return new Response(response.body, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
};
