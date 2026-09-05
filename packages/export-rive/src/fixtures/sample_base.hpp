#ifndef _RIVE_SAMPLE_BASE_HPP_
#define _RIVE_SAMPLE_BASE_HPP_
#include "rive/core/field_types/core_bool_type.hpp"
#include "rive/core/field_types/core_color_type.hpp"
#include "rive/core/field_types/core_double_type.hpp"
#include "rive/core/field_types/core_string_type.hpp"
#include "rive/core/field_types/core_uint_type.hpp"
#include "rive/node.hpp"
namespace rive
{
class SampleBase : public Node
{
protected:
    typedef Node Super;

public:
    static const uint16_t typeKey = 999;

    bool isTypeOf(uint16_t typeKey) const override
    {
        switch (typeKey)
        {
            case SampleBase::typeKey:
            case NodeBase::typeKey:
                return true;
            default:
                return false;
        }
    }

    uint16_t coreType() const override { return typeKey; }

    static const uint16_t widthPropertyKey = 100;
    static const uint16_t isVisiblePropertyKey = 101;
    static const uint16_t labelPropertyKey = 102;
    static const uint16_t colorValuePropertyKey = 103;
    static const uint16_t countPropertyKey = 104;
    // No case in deserialize() below; type must be inferred from the field.
    static const uint16_t tintPropertyKey = 105;

protected:
    float m_Width = 0.0f;
    bool m_IsVisible = true;
    std::string m_Label = "";
    int m_ColorValue = 0xFF747474;
    uint32_t m_Count = 0;
    ColorInt m_Tint = 0xFFFFFFFF;

public:
    inline float width() const { return m_Width; }
    void width(float value) { m_Width = value; }

    inline bool isVisible() const { return m_IsVisible; }
    void isVisible(bool value) { m_IsVisible = value; }

    inline const std::string& label() const { return m_Label; }
    void label(std::string value) { m_Label = value; }

    inline int colorValue() const { return m_ColorValue; }
    void colorValue(int value) { m_ColorValue = value; }

    inline uint32_t count() const { return m_Count; }
    void count(uint32_t value) { m_Count = value; }

    Core* clone() const override;
    void copy(const SampleBase& object)
    {
        m_Width = object.m_Width;
        m_IsVisible = object.m_IsVisible;
        m_Label = object.m_Label;
        m_ColorValue = object.m_ColorValue;
        m_Count = object.m_Count;
        m_Tint = object.m_Tint;
        Node::copy(object);
    }

    bool deserialize(uint16_t propertyKey, BinaryReader& reader) override
    {
        switch (propertyKey)
        {
            case widthPropertyKey:
                m_Width = CoreDoubleType::deserialize(reader);
                return true;
            case isVisiblePropertyKey:
                m_IsVisible = CoreBoolType::deserialize(reader);
                return true;
            case labelPropertyKey:
                m_Label = CoreStringType::deserialize(reader);
                return true;
            case colorValuePropertyKey:
                m_ColorValue = CoreColorType::deserialize(reader);
                return true;
            case countPropertyKey:
                m_Count = CoreUintType::deserialize(reader);
                return true;
        }
        return Node::deserialize(propertyKey, reader);
    }

protected:
    virtual void widthChanged() {}
    virtual void isVisibleChanged() {}
    virtual void labelChanged() {}
    virtual void colorValueChanged() {}
    virtual void countChanged() {}
    virtual void tintChanged() {}
};
} // namespace rive

#endif
