import os
from pyexpat.errors import messages
from time import sleep

from model.dto import ChatDTO
from langchain_ollama.chat_models import ChatOllama
from langchain_ollama.llms import OllamaLLM
from langchain_core.messages import SystemMessage, trim_messages
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_openai.llms import OpenAI
import time
from langchain_core.messages import HumanMessage, BaseMessage, AIMessage, SystemMessage
from model.bo import ChatMessageBO
import json
from model.vo import ChatVO
from model.vo.chat_vo import Choice
from model.bo import ChatMessageBO
from constants.chat_model_constants import CHAT_MODELS
from duckduckgo_search import DDGS
from core.logger import get_logger
from typing import List
from core.config import OPENAI_API_BASE, HTTP_PROXY, HTTPS_PROXY
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from utils.model_util import get_model


class ChatService:

    def __init__(self):
        self.logger = get_logger()

    def yield_results(self, model: str, content: str):
        now = time.time()
        yield 'id: {}\nevent: message\ndata: {}\n\n'.format(now, json.dumps({
            "id": now,
            "created": now,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "content": content
                    }
                }
            ]
        }))

    def build_messages(self, chat_message_bo: List[ChatMessageBO]) -> List[BaseMessage]:
        messages = []
        for message in chat_message_bo:
            if message.role == "user":
                messages.append(HumanMessage(content=message.content))
            elif message.role == "assistant":
                messages.append(AIMessage(content=message.content))
            elif "system" == message.role:
                messages.append(SystemMessage(content=message.content))
        return messages

    def trim_message(self, model, messages: List[BaseMessage]) -> List[BaseMessage]:
        trimmer = trim_messages(
            max_tokens=65,
            strategy="last",
            token_counter=model,
            include_system=True,
            allow_partial=False,
            start_on="human",
        )
        return trimmer.invoke(messages)

    def chat_ollama(self, chat_dto: ChatDTO):
        print(chat_dto.model)
        model = ChatOllama(model=chat_dto.model)
        messages = self.trim_message(model, self.build_messages(chat_dto.messages))
        # resp = chat_ollama.chat(messages)
        # print(resp)
        #
        for chunk in model.stream(messages):
            print(chunk)
            if isinstance(chunk, AIMessage):
                yield from self.yield_results(chat_dto.model, chunk.content)


    def chat_gemma(self, chat_dto: ChatDTO):
        yield from self.chat_ollama(chat_dto)

    def chat_openai(self, chat_dto: ChatDTO):
        print(os.getenv("OPENAI_API_BASE"))
        openai_model = ChatOpenAI(model=chat_dto.model)
        messages = self.build_messages(chat_dto.messages)
        print(messages)
        for chunk in openai_model.stream(messages):
            if isinstance(chunk, AIMessage):
                yield from self.yield_results(chat_dto.model, chunk.content)

    def build_web_search_documents_index(self, query):
        pass
        # link_list = []
        # with DDGS() as ddgs:
        #     search_res_list = ddgs.text(query, region='cn-zh', max_results=10)
        #     for search_res in search_res_list:
        #         print(search_res["href"])
        #         link_list.append(search_res["href"])
        # print(0)
        # print(link_list[0])
        #
        # documents = SimpleWebPageReader(html_to_text=True).load_data(
        #     link_list
        # )
        # index = SummaryIndex.from_documents(documents, service_context=ServiceContext
        #                                     .from_defaults(
        #     embed_model=HuggingFaceEmbedding(model_name="BAAI/bge-small-zh-v1.5")))
        # return index

    def add_source_numbers(self, lst, source_name="Source", use_source=True):
        if use_source:
            return [
                f'[{idx + 1}]\t "{item[0]}"\n{source_name}: {item[1]}'
                for idx, item in enumerate(lst)
            ]
        else:
            return [f'[{idx + 1}]\t "{item}"' for idx, item in enumerate(lst)]

    def generate(self, messages: [], llm, model_name: str):
        response = llm.stream_chat(messages)
        for r in response:
            yield from self.yield_results(model_name, r.delta)

    def web_search_chat(self, chat_dto: ChatDTO, llm):
        pass
        # query = chat_dto.messages[len(chat_dto.messages) - 1].content
        # proxies = None
        # if HTTPS_PROXY is not None and HTTP_PROXY is not None:
        #     proxies = {
        #         "http": HTTP_PROXY,
        #         "https": HTTPS_PROXY
        #     }
        # search_results = []
        # # with DDGS(proxies=proxies) as ddgs:
        # with DDGS(proxies=proxies) as ddgs:
        #     search_res_list = ddgs.text(query, max_results=10)
        #     for r in search_res_list:
        #         search_results.append(r)
        # reference_results = []
        # for idx, result in enumerate(search_results):
        #     self.logger.info(f"搜索结果{idx + 1}：{result}")
        #     reference_results.append([result["body"], result["href"]])
        # reference_results = self.add_source_numbers(reference_results)
        # prompt = (WEBSEARCH_PTOMPT_TEMPLATE
        #           .replace("{query}", query)
        #           .replace("{web_results}", "\n\n".join(reference_results))
        #           .replace("{reply_language}", "Chinese"))
        # self.logger.info(F"prompt:\n{prompt}")
        # yield from self.generate(messages=[ChatMessage(content=prompt, role="user")],
        #                     llm=llm,
        #                     model_name=chat_dto.model)

    def gemma2_web_search(self, chat_dto: ChatDTO):
        pass
        # query = chat_dto.messages[len(chat_dto.messages) - 1].content
        # index = self.build_web_search_documents_index(query)
        # query_engine = index.as_query_engine(llm=Ollama(model="gemma2", request_timeout=30.0))
        # response = query_engine.query(query)
        # yield from self.yield_results(chat_dto.model, str(response))

    def gemma_web_search(self, chat_dto: ChatDTO):
        pass
        # print("BAAI/bge-small-zh-v1.5")
        # # Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-zh-v1.5")
        # query = chat_dto.messages[len(chat_dto.messages) - 1].content
        # index = self.build_web_search_documents_index(query)
        # print("start query")
        # query_engine = index.as_query_engine(llm=Ollama(model="gemma"))
        # print("start query open")
        # response = query_engine.query(query)
        # yield from self.yield_results(chat_dto.model, str(response))

    def gpt4_turbo_preview_search(self, chat_dto: ChatDTO):
        pass
        # query = chat_dto.messages[len(chat_dto.messages) - 1].content
        # index = self.build_web_search_documents_index(query)
        # query_engine = index.as_query_engine(llm=OpenAI(model="gpt-4-turbo-preview"))
        # response = query_engine.query(query)
        # yield from self.yield_results(chat_dto.model, str(response))

    def gpt4_turbo_preview_search_v2(self, chat_dto: ChatDTO):
        pass
        # llm = OpenAI(model="gpt-4-turbo-preview")
        # yield from self.web_search_chat(chat_dto=chat_dto, llm=llm)

    def gpt4_turbo_preview(self, chat_dto: ChatDTO):
        yield from self.chat_openai(chat_dto)

    def run_chat_model_stream(self, model,  chat_dto: ChatDTO, is_trim_messages: bool):
        messages = self.build_messages(chat_dto.messages)
        if is_trim_messages:
            messages = self.trim_message(model, messages)
        for chunk in model.stream(messages):
            print(chunk)
            if isinstance(chunk, AIMessage):
                yield from self.yield_results(chat_dto.model, chunk.content)
        print("DONE")
        print(model.invoke(messages))

    def get_tools_dict(self):
        return {
            "duckduckgo_results_json": DuckDuckGoSearchResults()
        }

    def run_chat_model_with_tools_stream(self, model,  chat_dto: ChatDTO, is_trim_messages: bool):
        messages = self.build_messages(chat_dto.messages)
        if is_trim_messages:
            messages = self.trim_message(model, messages)
        ai_msg = model.invoke(messages)
        print(ai_msg.tool_calls)
        for tool_call in ai_msg.tool_calls:
            selected_tools = self.get_tools_dict()[tool_call["name"].lower()]
            tool_msg = selected_tools.invoke(tool_call)
            print(tool_msg)
            messages.append(tool_msg)
        print(messages)
        for chunk in model.stream(messages):
            print(chunk)
            if isinstance(chunk, AIMessage):
                yield from self.yield_results(chat_dto.model, chunk.content)


    def get_ollama_chat_model(self, model_name: str) -> ChatOllama:
        """获取Ollama模型"""
        return ChatOllama(model=model_name)

    def get_openai_chat_model(self, model_name: str) -> ChatOpenAI:
        return ChatOpenAI(model=model_name)

    def qwen_web_search(self, chat_dto: ChatDTO):
        """千问网页搜索"""
        model = self.get_ollama_chat_model("qwen2.5")
        llm_with_tools = model.bind_tools([DuckDuckGoSearchResults()])
        yield from self.run_chat_model_with_tools_stream(llm_with_tools, chat_dto, True)

    def openai_web_search(self, chat_dto: ChatDTO):
        model = self.get_openai_chat_model("gpt-4o")
        llm_with_tools = model.bind_tools([DuckDuckGoSearchResults()])
        yield from self.run_chat_model_with_tools_stream(llm_with_tools, chat_dto, False)

    def chat_model(self, chat_dto: ChatDTO):
        model = get_model(chat_dto.model)
        messages = self.build_messages(chat_dto.messages)
        print(messages)
        for chunk in model.stream(messages):
            if isinstance(chunk, AIMessage):
                yield from self.yield_results(chat_dto.model, chunk.content)


    def chat(self, chat_dto: ChatDTO):
        print(chat_dto.model)
        # self.logger(F"{json.dumps(chat_dto)}")
        if "gemma" == chat_dto.model:
            yield from self.chat_gemma(chat_dto)
        elif CHAT_MODELS["GEMMA2"] == chat_dto.model:
            yield from self.chat_ollama(chat_dto)
        elif CHAT_MODELS["GEMMA2_WEB_SEARCH"] == chat_dto.model:
            yield from self.gemma2_web_search(chat_dto)
        elif CHAT_MODELS["QWEN_WEB_SEARCH"] == chat_dto.model:
            yield from self.qwen_web_search(chat_dto)
        elif CHAT_MODELS["OPENAI_WEB_SEARCH"] == chat_dto.model:
            yield from self.openai_web_search(chat_dto)
        elif CHAT_MODELS["GEMMA_WEB_SEARCH"] == chat_dto.model:
            yield from self.gemma_web_search(chat_dto)
        elif CHAT_MODELS["GPT_4_TURBO_PREVIEW_WEB_SEARCH"] == chat_dto.model:
            yield from self.gpt4_turbo_preview_search(chat_dto)
        elif CHAT_MODELS["GPT_4_TURBO_PREVIEW"] == chat_dto.model:
            yield from self.gpt4_turbo_preview(chat_dto)
        elif CHAT_MODELS["GPT_4_TURBO_PREVIEW_WEB_SEARCH_V2"] == chat_dto.model:
            yield from self.gpt4_turbo_preview_search_v2(chat_dto)
        else:
            yield from self.chat_model(chat_dto)
