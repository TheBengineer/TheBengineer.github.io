source "https://rubygems.org"

# Local and Netlify builds. GitHub Pages builds the site itself and ignores
# this Gemfile.
gem "jekyll", "~> 3.9.3"
gem "jekyll-feed", "~> 0.6"
gem "kramdown-parser-gfm"

# Windows and JRuby do not include zoneinfo files, so bundle the tzinfo-data
# gem and associated library.
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance-booster for watching directories on Windows
gem "wdm", "~> 0.1.0", :install_if => Gem.win_platform?
