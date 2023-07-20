import {ChatOpenAI} from "langchain/chat_models/openai"
import {HumanMessage, SystemMessage} from "langchain/schema";
import {z, type ZodError} from 'zod'

interface GenericPromptOptions {
  gpt4?: boolean
}

type AtLeastOne<T> = [T, ...T[]];

function createLLM(promptOptions?: GenericPromptOptions) {
  return new ChatOpenAI({
    temperature: 0,
    modelName: promptOptions?.gpt4 ? "gpt-4" : "gpt-3.5-turbo"
  })
}

/**
 * Asynchronously handles a binary prompt to return a boolean answer.
 *
 * This function creates a Language Learning Model (LLM) from the provided options
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
  if (!prompt)  {
    return false
  }
  const llm = createLLM(promptOptions)
  const result = await llm.call([
    new SystemMessage("Answer the following question with a true or false."),
    new HumanMessage(prompt)
  ], {
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
  const answer = JSON.parse(result.additional_kwargs.function_call?.arguments as string)
  return zBooleanAnswer.parse(answer).value
}

/**
 * Asynchronously handles a categorical prompt and returns the classified category
 *
 * This function creates a Language Learning Model (LLM) from the provided options
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
  const llm = createLLM(promptOptions)
  const result = await llm.call([
    new SystemMessage(`Answer the following question with one of the following allowed values: ${allowedValues.join(", ")}. You MUST use the exact spelling and capitalization of the values.`),
    new HumanMessage(prompt)
  ], {
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
  const returnedValue = JSON.parse(result.additional_kwargs.function_call?.arguments as string)
  const zStringAnswer = z.object({value: z.enum(allowedValues)})
  return zStringAnswer.parse(returnedValue).value
}

/**
 * Asynchronously handles a list prompt and returns an array of selected values.
 *
 * This function creates a Language Learning Model (LLM) from the provided options
 * and prompts the user with a message. The user is expected to select a minimum
 * and maximum number of values from the allowed list, and the function returns an array
 * of these values.
 *
 * @export
 * @param {string} prompt - The prompt message to display to the user.
 * @param {AtLeastOne<string>} allowedValues - Array of allowable values.
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
export async function list(prompt: string, allowedValues: AtLeastOne<string>, minValues = 1, maxValues = 5, promptOptions?: GenericPromptOptions): Promise<string[]> {
  if (minValues >= maxValues) {
    throw new Error("minValues must be less than maxValues")
  }
  if (minValues < 0) {
    throw new Error("minValues must be greater than zero")
  }
  if (!prompt) {
    return []
  }
  const llm = createLLM(promptOptions)
  const zeroMessage = minValues === 0 ? "You may also answer with no values." : ""
  const multipleMessage = minValues > 1 ? "You may also answer with multiple values." : ""
  const result = await llm.call([
    new SystemMessage(`Answer the following question with AT LEAST ${minValues} and AT MOST ${maxValues} of the following allowed values: ${allowedValues.join(", ")}. You MUST use the exact spelling and capitalization of the values. ${multipleMessage}${zeroMessage}`),
    new HumanMessage(prompt)
  ], {
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
              description: "The values to use, MUST be from the list of allowed values",
              minItems: minValues,
              maxItems: maxValues,
              items: {
                type: "string",
                enum: allowedValues
              }
            },
          },
        },
      }
    ]
  })
  const returnedValue = JSON.parse(result.additional_kwargs.function_call?.arguments as string)
  const zStringArrayAnswer = z.object({
    value: z.array(z.enum(allowedValues))
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
export async function string(prompt: string) {
  if (!prompt) {
    return ""
  }
  const llm = createLLM()
  const result = await llm.call([
    new HumanMessage(prompt)
  ])
  return result.content
}