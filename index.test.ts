import * as schema from './index'
import {config} from 'dotenv'
import {z} from 'zod'

config()


describe("zod tests", () => {
  it("should parse numbers", () => expect(schema.asZodType("what is 2+2", z.number())).resolves.toBe(4))
  it("should parse objects", () => expect(schema.asZodType("hey i'm jose and i'm 42 years old", z.object({
    name: z.string(),
    age: z.number()
  }))).resolves.toStrictEqual({
    name: "jose",
    age: 42
  }))
  it("should parse arrays", () => expect(schema.asZodType("my favorite colors are red and green", z.array(z.string()).describe("favorite colors"))).resolves.toStrictEqual(["red", "green"]))
})

describe('booleans', () => {
  it("should return true for a positive review", () => expect(schema.bool("Did this review user like the business? Best bang for your buck. For a price much cheaper than college consultants, I have hundreds of successful Ivy League applications at my fingertips.")).resolves.toBe(true))

  it("should handle short strings", () => expect(schema.bool("Did this review user like the business? worst service EVER!")).resolves.toBe(false))

  it("should return false for an empty string", () => expect(schema.bool("")).resolves.toBe(false))
})

describe('enums', () => {
  it("should classify basic values correctly", () => expect(schema.categorize("My favorite color is red", ["red", "blue", "green"])).resolves.toBe("red"))

  it("should not throw an error for an invalid value", () => expect(schema.categorize("My favorite color is red", ["blue", "green"])).resolves.not.toThrow())

  it("should classify values with spaces correctly", () => expect(schema.categorize("I prefer watching Science Fiction movies", ["Science Fiction", "Romantic Comedy", "Action Adventure"])).resolves.toBe("Science Fiction"))

  it("should classify values with special characters correctly", () => expect(schema.categorize("I enjoy listening to Guns N' Roses", ["AC'DC", "Guns N' Roses", "Léd Zeppelin"])).resolves.toBe("Guns N' Roses"))
})

describe('createList function', () => {
  it("should classify multiple basic values correctly", async () => {
    const values = await schema.list("My favorite colors are red and green", ["red", "blue", "green"])
    expect(values).toEqual(["red", "green"])
  })

  it("should handle a mix of valid and invalid values", async () => {
    const values = await schema.list("My favorite colors are red, green and pink", ["red", "blue", "green"])
    expect(values).toEqual(["red", "green"])
  })

  it("should classify multiple values with special characters correctly", async () => {
    const values = await schema.list("I enjoy listening to AC/DC and Guns N' Roses", ["AC/DC", "Guns N' Roses", "Led Zeppelin"])
    expect(values).toEqual(["AC/DC", "Guns N' Roses"])
  })

  it("should limit the returned values to the specified maxValues", async () => {
    const values = await schema.list("I enjoy listening to AC/DC, Guns N' Roses, and Led Zeppelin", ["AC/DC", "Guns N' Roses", "Led Zeppelin"], 1, 2)
    expect(values.length).toBe(2)
  })

  it("should throw an error when fewer than minValues are provided", async () => {
    await expect(schema.list("I enjoy listening to AC/DC", ["AC/DC", "Guns N' Roses", "Led Zeppelin"], 2, 3)).rejects.toThrow()
  })
})


describe('createList function edge cases', () => {
  it("should handle the edge case where minValues is equal to maxValues", async () => {
    await expect(schema.list("I enjoy listening to AC/DC and Guns N' Roses", ["AC/DC", "Guns N' Roses", "Led Zeppelin"], 2, 2)).rejects.toThrow()
  })

  it("should return an empty array when no values are provided and minValues is zero", async () => {
    const values = await schema.list(" ", ["AC/DC", "Guns N' Roses", "Led Zeppelin"], 0, 3)
    expect(values).toEqual([])
  })
  it("should not return an empty array when no values are provided and minValues is non zero", async () => {
    const values = await schema.list(" ", ["AC/DC", "Guns N' Roses", "Led Zeppelin"], 1, 3)
    expect(values.length).toBeGreaterThan(0)
  })

  it("should handle the case where the prompt mentions more items than maxValues", async () => {
    const values = await schema.list("I enjoy listening to AC/DC, Guns N' Roses, Led Zeppelin, and Pink Floyd", ["AC/DC", "Guns N' Roses", "Led Zeppelin", "Pink Floyd"], 1, 3)
    expect(values.length).toBe(3)
  })
})
