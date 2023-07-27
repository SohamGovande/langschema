import {OpenAIApi, Configuration, CreateChatCompletionRequest} from 'openai'
import {z, type ZodError} from 'zod'
import {zodToJsonSchema} from "zod-to-json-schema"

interface GenericPromptOptions {
  gpt4?: boolean
}

type AtLeastOne<T> = [T, ...T[]];

async function backoff<T>(
  retries: number,
  fn: () => Promise<T>,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 1) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return backoff(retries - 1, fn, delay * 2);
  }
}

function buildLLM() {
  const openai = new OpenAIApi(new Configuration({apiKey: process.env.OPENAI_API_KEY}))
  return {
    createChatCompletion(request: CreateChatCompletionRequest) {
      return backoff(10, () => openai.createChatCompletion(request), 500)
    }
  }
}

function buildLLMOptions(promptOptions?: GenericPromptOptions) {
  return {
    temperature: 0,
    model: promptOptions?.gpt4 ? "gpt-4" : "gpt-3.5-turbo"
  }
}

export async function asZodType<T>(prompt: string, zodType: z.ZodType<T>, promptOptions?: GenericPromptOptions): Promise<T> {
  if (!prompt) {
    return zodType.parse("")
  }
  const openai = buildLLM()
  const llmOptions = buildLLMOptions(promptOptions)
  let wrapperZod: any
  let shouldWrap = (zodType._def as any).typeName !== "ZodObject"
  if (shouldWrap) {
    wrapperZod = z.object({value: zodType})
  } else {
    wrapperZod = zodType
  }

  const jsonSchema = zodToJsonSchema(wrapperZod, "wrapper").definitions?.wrapper

  const result = await openai.createChatCompletion({
    ...llmOptions,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    function_call: {name: "answer"},
    functions: [
      {
        name: "answer",
        description: "Answer the user's question",
        parameters: jsonSchema
      }
    ]
  })
  const evaluated = wrapperZod.parse(JSON.parse(result.data.choices[0].message!.function_call!.arguments!))
  return shouldWrap ? (evaluated.value as T) : evaluated as T
}

/**
 * Asynchronously handles a binary prompt to return a boolean answer.
 *
 * This function creates a Large Language Model (LLM) from the provided options
 * and prompts the user with a message. It then returns a boolean value based on the
 * user's answer.
 *
 * @export
 * @param {string} prompt - The prompt message to display to the user.
 * @param {GenericPromptOptions} [promptOptions] - Optional settings for the prompt.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating the user's response.
 *
 * @throws {ZodError} If the parsed response does not match the expected structure.
 *
 * @async
 */
export async function bool(prompt: string, promptOptions?: GenericPromptOptions): Promise<boolean> {
  if (!prompt) {
    return false
  }
  const openai = buildLLM()
  const llmOptions = buildLLMOptions(promptOptions)
  const result = await openai.createChatCompletion({
    ...llmOptions,
    messages: [
      {
        role: "system",
        content: 'Answer the following question with a true or false.'
      },
      {
        role: "user",
        content: prompt
      }
    ],
    function_call: {name: "answer"},
    functions: [
      {
        name: "answer",
        description: "Answer the user's question",
        parameters: {
          type: "object",
          required: ["value"],
          description: "An object containing a boolean value.",
          properties: {
            value: {
              type: "boolean",
              description: "The boolean value to return.",
            },
          },
        },
      }
    ]
  })
  const zBooleanAnswer = z.object({value: z.boolean()})

  const answer = JSON.parse(result.data.choices[0].message?.function_call?.arguments as string)
  return zBooleanAnswer.parse(answer).value
}

/**
 * Asynchronously handles a categorical prompt and returns the classified category
 *
 * This function creates a Large Language Model (LLM) from the provided options
 * and prompts the user with a message. It then returns the selected category,
 * which must be one of the provided allowed values.
 *
 * @export
 * @param {string} prompt - The user's question to classify
 * @param {AtLeastOne<string>} allowedValues - Array of allowable categorical values.
 * @param {GenericPromptOptions} [promptOptions] - Optional settings for the prompt.
 * @returns {Promise<string>} A promise that resolves to a string indicating the user's selected category.
 *
 * @throws {Error} If no prompt is provided.
 * @throws {ZodError} If the parsed response does not match the expected structure or is not one of the allowed values.
 *
 * @async
 */
export async function categorize(prompt: string, allowedValues: AtLeastOne<string>, promptOptions?: GenericPromptOptions): Promise<string> {
  if (!prompt) {
    throw new Error("Prompt is required")
  }
  const openai = buildLLM()
  const llmOptions = buildLLMOptions(promptOptions)
  const result = await openai.createChatCompletion({
    ...llmOptions,
    messages: [
      {
        role: "system",
        content: `Answer the following question with one of the following allowed values: ${allowedValues.join(", ")}. You MUST use the exact spelling and capitalization of the values.`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    function_call: {name: "answer"},
    functions: [
      {
        name: "answer",
        description: "Answer the user's question",
        parameters: {
          type: "object",
          required: ["value"],
          properties: {
            value: {
              type: "string",
              enum: allowedValues,
              description: "The value to use, MUST be one of the allowed values",
            },
          },
        },
      }
    ]
  })
  const returnedValue = JSON.parse(result.data.choices[0].message?.function_call?.arguments as string)
  const zStringAnswer = z.object({value: z.enum(allowedValues)})
  return zStringAnswer.parse(returnedValue).value
}

/**
 * Asynchronously handles a list prompt and returns an array of selected values.
 *
 * This function creates a Large Language Model (LLM) from the provided options
 * and prompts the user with a message. The user is expected to select a minimum
 * and maximum number of values from the allowed list, and the function returns an array
 * of these values.
 *
 * @export
 * @param {string} prompt - The prompt message to display to the user.
 * @param {null | AtLeastOne<string>} allowedValues - Array of allowable values. Null indicates that any string is allowed.
 * @param {number} [minValues=1] - The minimum number of values the user must select.
 * @param {number} [maxValues=5] - The maximum number of values the user can select.
 * @param {GenericPromptOptions} [promptOptions] - Optional settings for the prompt.
 * @returns {Promise<string[]>} A promise that resolves to an array of strings indicating the user's selected values.
 *
 * @throws {Error} If no prompt is provided, if minValues is not less than maxValues, or if minValues is not greater than zero.
 * @throws {ZodError} If the parsed response does not match the expected structure or is not one of the allowed values.
 *
 * @async
 */
export async function list(prompt: string, allowedValues: null | AtLeastOne<string>, minValues = 1, maxValues = 5, promptOptions?: GenericPromptOptions): Promise<string[]> {
  if (minValues >= maxValues) {
    throw new Error("minValues must be less than maxValues")
  }
  if (minValues < 0) {
    throw new Error("minValues must be greater than zero")
  }
  if (!prompt) {
    return []
  }
  const llmOptions = buildLLMOptions(promptOptions)
  const zeroMessage = minValues === 0 ? "You may also answer with no values." : ""
  const multipleMessage = minValues > 1 ? "You may also answer with multiple values." : ""
  const allowedValuesMessage = allowedValues ? ` of the following allowed values: ${allowedValues.join(", ")}. You MUST use the exact spelling and capitalization of the values` : ""
  const itemsType: any = {type: "string"}
  if (allowedValues) {
    itemsType.enum = allowedValues
  }
  const openai = buildLLM()
  const result = await openai.createChatCompletion({
    ...llmOptions,
    messages: [
      {
        role: "system",
        content: `Answer the following question with AT LEAST ${minValues} and AT MOST ${maxValues}${allowedValuesMessage}. ${multipleMessage}${zeroMessage}`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    function_call: {name: "answer"},
    functions: [
      {
        name: "answer",
        description: "Answer the user's question",
        parameters: {
          type: "object",
          required: ["value"],
          properties: {
            value: {
              type: "array",
              description: "The values to use",
              minItems: minValues,
              maxItems: maxValues,
              items: itemsType
            },
          },
        },
      }
    ]
  })
  const returnedValue = JSON.parse(result.data.choices[0].message?.function_call?.arguments as string)
  const zStringArrayAnswer = z.object({
    value: z.array(allowedValues ? z.enum(allowedValues) : z.string())
  })
  const parsedValue = zStringArrayAnswer.parse(returnedValue).value
  if (parsedValue.length < minValues) {
    throw new Error(`You must provide at least ${minValues} values`)
  } else if (parsedValue.length > maxValues) {
    parsedValue.splice(maxValues)
  }
  return parsedValue
}

/**
 * Asynchronously handles a string prompt and returns any string response. No ouptut validation is performed.
 *
 * @export
 * @param {string} prompt - The prompt message to display to the user.
 * @returns {Promise<string>} A promise that resolves to a string indicating the content of the user's response.
 *
 * @throws {Error} If the LLM fails to create or call.
 *
 * @async
 */
export async function string(prompt: string): Promise<string> {
  if (!prompt) {
    return ""
  }
  const openai = buildLLM()
  const llmOptions = buildLLMOptions()
  const result = await openai.createChatCompletion({
    ...llmOptions,
    messages: [
      {
        role: "system",
        content: "You will follow the user's instructions exactly. You will respond with ONLY what the user requests, and NO extraneous information like 'Sure, here you go:', or 'That's a great question!', etc."
      },
      {
        role: "user",
        content: prompt
      }
    ],
  })
  return result.data.choices[0].message!.content!
}