// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

type bingBackgroundResp struct {
	ImageUrl  string `json:"imageUrl"`
	Title     string `json:"title"`
	FetchedAt int64  `json:"fetchedAt"`
}

type bingRawImage struct {
	Url       string `json:"url"`
	Copyright string `json:"copyright"`
}

type bingRaw struct {
	Images []bingRawImage `json:"images"`
}

var (
	bingCache    *bingBackgroundResp
	bingCacheMu  sync.RWMutex
	bingCacheTtl = 6 * time.Hour
	bingFallback = &bingBackgroundResp{
		ImageUrl: "https://www.bing.com/th?id=OHR.OdeonAthens_EN-US2166580245_1920x1080.jpg",
		Title:    "Bing Daily Wallpaper",
	}
)

// BingBackground
// @Title BingBackground
// @Tag System API
// @Description Get Bing daily wallpaper (cached 6h)
// @Success 200 {object} object
// @router /public/bing-background [get]
func (c *ApiController) BingBackground() {
	now := time.Now()

	bingCacheMu.RLock()
	if bingCache != nil && now.Sub(time.Unix(bingCache.FetchedAt, 0)) < bingCacheTtl {
		cached := *bingCache
		bingCacheMu.RUnlock()
		c.Data["json"] = &cached
		c.ServeJSON()
		return
	}
	bingCacheMu.RUnlock()

	resp := fetchBing()
	resp.FetchedAt = now.Unix()

	bingCacheMu.Lock()
	bingCache = resp
	bingCacheMu.Unlock()

	c.Data["json"] = resp
	c.ServeJSON()
}

func fetchBing() *bingBackgroundResp {
	client := &http.Client{Timeout: 5 * time.Second}
	r, err := client.Get("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN")
	if err != nil {
		return cloneBingFallback()
	}
	defer r.Body.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return cloneBingFallback()
	}

	var raw bingRaw
	if err := json.Unmarshal(body, &raw); err != nil || len(raw.Images) == 0 || raw.Images[0].Url == "" {
		return cloneBingFallback()
	}

	img := raw.Images[0]
	title := img.Copyright
	if title == "" {
		title = "Bing Daily Wallpaper"
	}
	return &bingBackgroundResp{
		ImageUrl: "https://www.bing.com" + img.Url,
		Title:    title,
	}
}

func cloneBingFallback() *bingBackgroundResp {
	cp := *bingFallback
	return &cp
}
