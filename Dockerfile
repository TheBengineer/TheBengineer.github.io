FROM ruby:2.7.4
LABEL authors="TheBengineer"

ADD . /pwd

RUN gem install jekyll:3.9.3


