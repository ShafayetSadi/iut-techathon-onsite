from pydantic import BaseModel, ConfigDict, Field


class TranscriptionResponse(BaseModel):
    transcript: str
    language_code: str | None = Field(default=None, alias="languageCode")

    model_config = ConfigDict(populate_by_name=True)
