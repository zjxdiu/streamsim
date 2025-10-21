## What is this

Streamsim is originally a [Websim project](https://websim.ai/@stackingbooks/streamsim). It's one of the most popular project on the platform.

It is basically a streamer simulator, but it sends your actual screenshots to a vLLM (Vision Large Language Model) and ask AI to generate some chat messages, bits & donations, randomly votes for polling, etc., so it feels like you're streaming and get viewer chats, but it's all AI-generated content.

A huge shoutout to author [@stackingbooks](https://websim.com/@stackingbooks). This is truly one of the most inovative project I've ever seen on this platform.

## DISCLAIMER

I didn't get any active authorization or license from the original creater. I do not claim any rights and I won't say this is my work.

From my memory he/she had a comment back when the project isn't updated said feel free to fork and continue, but this comment is not around anymore. 

## New things?

For now, the only thing I did was to ask AI to change the code.

Instead of Websim's AI service, now it uses openai chat completions API as AI backend. There's also a section inside the webpage frontend to configure your own API params.

I also changed the format for emotes, since I had problem with small scale LLMs only generating half of the colon. So I switched to using brackets and it seems to work much better. 

## How to play

1. Download or clone this repo.

2. Use any web server software, set the main directory to your folder, and visit the website.

3. Setup your API info and other settings down the page. Only Openai compatible API is supported, and you should double check if the model supports image input. (**WARNING:** Using a commercial pricing API could be expensive)

4. Click "Start Recording" and select a screen or window to share to the browser, then just wait for chat. If sth goes wrong, check browser's console for detail.

## Additional tips

If you can't screen share or get error message, or just want to be more informative, go through this checklist first.

1. Issue with CORS

Some browser (like firefox) do not allow Authorization header to be included while "Access-Control-Allow-Headers" is "\*". This might broke it entirely or just affect API that actually requires a bearer token. For local backend like LM studio, it might work for some people (since LM studio API does not check for bearer token). 

**Solution:** Use another browser or change configuration. I use [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium) as my test browser and it works fine.

2. I can't share my screen

If your page is loaded in http and domain is not localhost or 127.0.0.1, then the screen capture won't work.

**Solution:** Switch to https in your web server software, or use localhost / 127.0.0.1.

3. Emotes are surrounded by \[brackets]

Known issue as I tried to change the format of emotes but didn't write the regex correctly. Should be fixed later on.

4. I have a somewhat decent GPU, how about using local model?

I use [LM studio](https://lmstudio.ai/) as backend API service and LLM inference. This software is designed to be easy-to-use, making it good for starter.

As for models, since AI is developing in fast pace, definitely check out hugging face for latest model. But for now, `Qwen/Qwen2.5-VL-7B-Instruct` and `google/gemma-3-4b-it` with Q5_K_M quantization seems to work well enough for my RTX 4060 8GB (still not very good, but if you have better GPU you can use larger models).

Keep in mind that inference speed is **really** important here. If it can't keep up, first try some speed hacks and tricks, then consider using smaller model, or set "AI Check Interval" to a larger value.